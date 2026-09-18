import copy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('center', ROOT / 'server.py')
center = importlib.util.module_from_spec(spec)
spec.loader.exec_module(center)


class HealthHandler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_GET(self):
        payload = json.dumps(self.server.health).encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class CenterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.folder = self.root / 'module'
        self.folder.mkdir()
        self.manager = None
        self.servers = []

    def tearDown(self):
        if self.manager: self.manager.close()
        for server in self.servers:
            server.shutdown(); server.server_close()
        self.temp.cleanup()

    def health_server(self, app='demo'):
        server = ThreadingHTTPServer(('127.0.0.1', 0), HealthHandler)
        server.health = {'app':app, 'project_root':str(self.folder)}
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.servers.append(server)
        return server

    def module(self, port):
        return {'id':'demo','name':'示例','subtitle':'测试','description':'测试入口','documents':['样本'],
                'outputs':'PNG','directory':'module','url':f'http://localhost:{port}/','health_path':'/health',
                'health_key':'app','health_value':'demo','runtime':'python','args':['fake.py']}

    def manage(self, item):
        self.manager = center.Manager({'title':'测试','workbenches':[item]}, self.root, self.root / 'data')
        return self.manager

    def test_existing_service_reused_and_left_running(self):
        service = self.health_server()
        item = self.module(service.server_port)
        manager = self.manage(item)
        with patch.object(center.subprocess, 'Popen') as spawn:
            manager._start('demo'); manager._start('demo')
            self.assertEqual(spawn.call_count, 0)
        self.assertEqual(manager.status('demo')['url'], item['url'])
        manager.close()
        self.assertEqual(center.read_json_url(item['url']+'health')['app'], 'demo')

    def test_browser_certificate_entry_preserves_health_root(self):
        service = self.health_server()
        item = self.module(service.server_port)
        item.update(runtime='node', entry_path='/certificates/')
        manager = self.manage(item)
        self.assertEqual(manager.probe(item), ('ready', item['url']))
        self.assertEqual(manager.status('demo')['url'], item['url']+'certificates/')

    def test_foreign_service_not_replaced(self):
        service = self.health_server('another-app')
        manager = self.manage(self.module(service.server_port))
        with patch.object(center.subprocess, 'Popen') as spawn:
            manager._start('demo'); spawn.assert_not_called()
        self.assertIn('已被其他服务', manager.errors['demo'])
        self.assertEqual(service.health['app'], 'another-app')

    def test_same_app_different_project_not_replaced(self):
        service = self.health_server()
        service.health['project_root'] = str(self.root / 'different')
        manager = self.manage(self.module(service.server_port))
        with patch.object(center.subprocess, 'Popen') as spawn:
            manager._start('demo'); self.assertEqual(spawn.call_count, 0)
        self.assertIn('已被其他服务', manager.errors['demo'])

    def test_discovery_finds_certificate_alternate_port(self):
        service = self.health_server()
        item = self.module(1)
        item['discovery_file'] = 'server.json'
        url = f'http://127.0.0.1:{service.server_port}/'
        (self.folder/'server.json').write_text(json.dumps({'url':url}))
        self.assertEqual(self.manage(item).probe(item), ('ready',url))

    def test_catalog_rejects_external_url_duplicate_and_path_escape(self):
        catalog = {'title':'测试', 'workbenches':[self.module(3999)]}
        file = self.root/'catalog.json'
        file.write_text(json.dumps(catalog))
        self.assertEqual(center.load_catalog(file,self.root)['workbenches'][0]['id'],'demo')
        for key, value in [('url','https://example.com/'),('directory','../'),('discovery_file','../secret.json')]:
            invalid=copy.deepcopy(catalog); invalid['workbenches'][0][key]=value; file.write_text(json.dumps(invalid))
            with self.assertRaises(ValueError): center.load_catalog(file,self.root)
        catalog['workbenches'] *= 2; file.write_text(json.dumps(catalog))
        with self.assertRaises(ValueError): center.load_catalog(file,self.root)

    def test_owned_service_starts_and_stops(self):
        with socket.socket() as reserve:
            reserve.bind(('127.0.0.1',0)); port=reserve.getsockname()[1]
        item=self.module(port)
        script='''import json
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
 def do_GET(self):
  body=json.dumps({'app':'demo','project_root':str(Path.cwd())}).encode()
  self.send_response(200); self.end_headers(); self.wfile.write(body)
HTTPServer(('127.0.0.1',PORT),H).serve_forever()
'''.replace('PORT',str(port))
        (self.folder/'fake.py').write_text(script)
        manager=self.manage(item); manager._start('demo')
        self.assertEqual(manager.status('demo')['state'],'ready')
        child=manager.jobs['demo']; self.assertIsNone(child.poll())
        manager._start('demo'); self.assertIs(manager.jobs['demo'],child)
        manager.close(); self.assertIsNotNone(child.poll())
        self.assertEqual(manager.probe(item)[0],'offline')

    def test_start_after_close_does_not_spawn(self):
        manager=self.manage(self.module(1)); manager.close()
        with patch.object(center.subprocess,'Popen') as spawn:
            manager.start('demo'); spawn.assert_not_called()

    def test_http_routes_and_start_permissions(self):
        health=self.health_server(); manager=self.manage(self.module(health.server_port))
        server=center.Server(('127.0.0.1',0),manager)
        self.servers.append(server); threading.Thread(target=server.serve_forever,daemon=True).start()
        url=f'http://127.0.0.1:{server.server_port}'
        payload=center.read_json_url(url+'/api/workbenches')
        self.assertEqual(payload['workbenches'][0]['state'],'ready')
        for path in ['/', '/open/demo', '/app.js', '/styles.css']:
            with center.OPENER.open(url+path) as response: self.assertEqual(response.status,200)
        for path in ['/../server.py', '/open/unknown']:
            with self.assertRaises(HTTPError) as error: center.OPENER.open(url+path)
            self.assertEqual(error.exception.code,404)
        for headers in [{}, {'X-Material-Center-Token':payload['token'],'Origin':'https://example.com'}]:
            with self.assertRaises(HTTPError) as error:
                center.OPENER.open(Request(url+'/api/start/demo',method='POST',headers=headers))
            self.assertEqual(error.exception.code,403)
        with patch.object(manager,'start') as start:
            request=Request(url+'/api/start/demo',method='POST',headers={'X-Material-Center-Token':payload['token'],'Origin':url})
            with center.OPENER.open(request) as response: self.assertEqual(response.status,202)
            start.assert_called_once_with('demo')
        with self.assertRaises(HTTPError) as error:
            center.OPENER.open(Request(url+'/api/health',headers={'Host':'outside.example'}))
        self.assertEqual(error.exception.code,403)


if __name__=='__main__': unittest.main()
