"""Local navigation and process supervision for the case-material workbenches."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit
from urllib.request import build_opener, ProxyHandler
import webbrowser

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
PORT = 3015
OPENER = build_opener(ProxyHandler({}))


def local_url(value):
    parsed = urlsplit(value)
    if (parsed.scheme != 'http' or parsed.hostname not in {'localhost', '127.0.0.1'}
            or not parsed.port or parsed.username or parsed.password or parsed.path not in {'', '/'}
            or parsed.query or parsed.fragment):
        raise ValueError('工作台地址必须是本机 HTTP 根地址')
    return value.rstrip('/') + '/'


def read_json_url(url, timeout=1.5):
    with OPENER.open(url, timeout=timeout) as response:
        return json.loads(response.read(65536))


def load_catalog(path=ROOT / 'workbenches.json', project=PROJECT):
    catalog = json.loads(path.read_text())
    modules = catalog['workbenches']
    if not isinstance(modules, list) or not 1 <= len(modules) <= 40:
        raise ValueError('请登记 1–40 个工作台')
    seen = set()
    for item in modules:
        identifier = item['id']
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,39}', identifier) or identifier in seen:
            raise ValueError('工作台标识需唯一，使用小写字母、数字和短横线')
        seen.add(identifier)
        folder = (project / item['directory']).resolve()
        if not folder.is_relative_to(project.resolve()) or not folder.is_dir():
            raise ValueError('工作台目录必须位于测试案例项目内')
        item['url'] = local_url(item['url'])
        if not re.fullmatch(r'/[a-zA-Z0-9/_-]*', item.get('entry_path', '/')):
            raise ValueError('工作台页面路径无效')
        if item['runtime'] not in {'python', 'node'}:
            raise ValueError('工作台运行环境仅支持 python 或 node')
        if not isinstance(item['args'], list) or not all(isinstance(a, str) for a in item['args']):
            raise ValueError('启动参数应为字符串数组')
        if not re.fullmatch(r'/[a-zA-Z0-9/_.-]+', item['health_path']):
            raise ValueError('健康检查地址无效')
        if item.get('discovery_file') and not (folder / item['discovery_file']).resolve().is_relative_to(folder):
            raise ValueError('服务记录必须位于工作台目录内')
    return catalog


def runtime_binary(kind):
    if kind == 'python':
        return sys.executable
    configured = os.environ.get('MATERIAL_CENTER_NODE')
    bundled = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
    candidates = [configured, str(bundled), shutil.which('node'), '/opt/homebrew/bin/node', '/usr/local/bin/node']
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise RuntimeError('未找到 Node.js，请先配置工作台运行环境。')


class Manager:
    def __init__(self, catalog, project=PROJECT, data=ROOT / 'local_data'):
        self.catalog, self.project, self.data = catalog, project, data
        self.modules = {m['id']: m for m in catalog['workbenches']}
        self.locks = {identifier: threading.Lock() for identifier in self.modules}
        self.jobs = {}
        self.errors = {}
        self.starting = set()
        self.stopped = threading.Event()
        self.spawn_lock = threading.Lock()

    def probe(self, item):
        candidates = [item['url']]
        folder = self.project / item['directory']
        if item.get('discovery_file'):
            try:
                info = json.loads((folder / item['discovery_file']).read_text())
                candidate = local_url(info['url'])
                if candidate not in candidates:
                    candidates.insert(0, candidate)
            except (OSError, ValueError, KeyError, TypeError):
                pass
        occupied = False
        for url in candidates:
            try:
                health = read_json_url(url + item['health_path'].lstrip('/'))
                if health.get(item['health_key']) == item['health_value']:
                    project_root = health.get('project_root')
                    same_project = isinstance(project_root, str) and Path(project_root).resolve() == folder.resolve()
                    if item['runtime'] != 'python' or same_project:
                        return 'ready', url
            except (OSError, ValueError, TypeError, AttributeError):
                pass
            if url == item['url']:
                try:
                    with socket.create_connection(('127.0.0.1', urlsplit(url).port), timeout=.3):
                        occupied = True
                except OSError:
                    pass
        return ('occupied' if occupied else 'offline'), item['url']

    def status(self, identifier):
        item = self.modules[identifier]
        state, url = self.probe(item)
        if state == 'ready':
            detail = '可以进入，方案保存在原工作台'
        elif identifier in self.starting:
            state, detail = 'starting', '正在启动，请稍候'
        elif identifier in self.errors:
            state, detail = 'error', self.errors[identifier]
        elif state == 'occupied':
            detail = '端口被其他服务使用，请关闭占用服务后重试'
        else:
            detail = '进入时自动启动'
        return {**{key: item[key] for key in ('id', 'name', 'subtitle', 'description', 'documents', 'outputs')},
                'state': state, 'detail': detail, 'url': url.rstrip('/') + item.get('entry_path', '/')}

    def statuses(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            return list(pool.map(self.status, self.modules))

    def start(self, identifier):
        if identifier not in self.modules:
            raise KeyError('未登记这个工作台')
        with self.locks[identifier]:
            if identifier in self.starting or self.stopped.is_set():
                return
            self.starting.add(identifier)
        threading.Thread(target=self._start, args=(identifier,), daemon=True).start()

    def _start(self, identifier):
        try:
            item = self.modules[identifier]
            state, _ = self.probe(item)
            if state == 'ready':
                self.errors.pop(identifier, None)
                return
            previous = self.jobs.get(identifier)
            if previous and previous.poll() is None:
                raise RuntimeError('服务仍在启动或响应缓慢，请稍后重新进入；详情见素材中心运行日志。')
            if state == 'occupied':
                raise RuntimeError('工作台端口已被其他服务使用；请先关闭占用服务，再重新进入。')
            folder = self.project / item['directory']
            binary = runtime_binary(item['runtime'])
            if item['runtime'] == 'node' and not (folder / item['args'][0]).is_file():
                raise RuntimeError('缺少工作台依赖，请先按该工作台说明安装依赖。')
            env = dict(os.environ)
            env['PATH'] = str(Path(binary).parent) + os.pathsep + env.get('PATH', '')
            self.data.mkdir(exist_ok=True, parents=True)
            self.errors.pop(identifier, None)
            with self.spawn_lock:
                if self.stopped.is_set():
                    return
                with (self.data / (identifier + '.log')).open('ab') as log:
                    process = subprocess.Popen([binary, *item['args']], cwd=folder, env=env,
                                               stdout=log, stderr=log, start_new_session=True)
                self.jobs[identifier] = process
            for _ in range(120):
                if self.stopped.wait(.5):
                    return
                if self.probe(item)[0] == 'ready':
                    return
                if process.poll() is not None:
                    raise RuntimeError('启动未完成，请查看素材中心运行日志，修复后重新进入。')
            raise RuntimeError('启动时间较长，请稍后重新进入；详情见素材中心运行日志。')
        except (OSError, RuntimeError, ValueError) as exc:
            self.errors[identifier] = str(exc)
        finally:
            self.starting.discard(identifier)

    def close(self):
        with self.spawn_lock:
            self.stopped.set()
            jobs = list(self.jobs.values())
        # Stop only child groups created by this center, never a pre-existing workbench.
        for process in jobs:
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                    process.wait(timeout=4)
                except ProcessLookupError:
                    pass
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=2)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, manager):
        self.manager, self.token = manager, secrets.token_urlsafe(32)
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def valid_host(self):
        return self.headers.get('Host') in {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}

    def send(self, status, value, content_type='application/json; charset=utf-8'):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if not self.valid_host():
            return self.send(403, {'error': '仅供本机访问'})
        path = urlsplit(self.path).path
        if path == '/api/health':
            return self.send(200, {'app': 'material-center', 'project_root': str(PROJECT)})
        if path == '/api/workbenches':
            return self.send(200, {'title': self.server.manager.catalog['title'], 'token': self.server.token,
                                   'workbenches': self.server.manager.statuses()})
        files = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'),
                 '/styles.css': ('styles.css', 'text/css'), '/favicon.svg': ('favicon.svg', 'image/svg+xml')}
        if path.startswith('/open/') and path[6:] in self.server.manager.modules:
            path = '/'
        if path not in files:
            return self.send(404, {'error': '入口不存在'})
        filename, typ = files[path]
        return self.send(200, (ROOT / 'web' / filename).read_bytes(), typ + '; charset=utf-8')

    def do_POST(self):
        if not self.valid_host():
            return self.send(403, {'error': '仅供本机访问'})
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://localhost:{self.server.server_port}', f'http://127.0.0.1:{self.server.server_port}'}:
            return self.send(403, {'error': '请从素材中心启动工作台'})
        if not secrets.compare_digest(self.headers.get('X-Material-Center-Token', ''), self.server.token):
            return self.send(403, {'error': '连接已更新，请刷新素材中心'})
        path = urlsplit(self.path).path
        if path.startswith('/api/start/') and path[11:] in self.server.manager.modules:
            self.server.manager.start(path[11:])
            return self.send(202, {'started': True})
        return self.send(404, {'error': '未登记这个工作台'})


def main():
    parser = argparse.ArgumentParser(description='启动测试案例素材中心')
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    url = f'http://localhost:{PORT}/'
    try:
        health = read_json_url(url + 'api/health')
        if health.get('app') == 'material-center' and health.get('project_root') == str(PROJECT):
            if args.open:
                webbrowser.open(url)
            print('素材中心已经运行：' + url)
            return
    except (OSError, ValueError, AttributeError):
        pass
    manager = Manager(load_catalog())
    try:
        server = Server(('127.0.0.1', PORT), manager)
    except OSError:
        raise SystemExit(f'{PORT} 端口已占用，未改动原服务。请关闭占用服务后重试。')
    for identifier in manager.modules:
        manager.start(identifier)
    print('测试案例素材中心已启动：' + url, flush=True)
    print('保持此窗口打开。Control+C 关闭素材中心及本次新启动的服务。', flush=True)
    print('已经在运行的工作台会复用，关闭本窗口不会停止它们。', flush=True)
    if args.open:
        webbrowser.open(url)
    def stop(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        manager.close()


if __name__ == '__main__':
    main()
