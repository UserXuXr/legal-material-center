export class IndexedDBStore {
  constructor(factory=globalThis.indexedDB) { this.factory=factory; }
  open() {
    if (!this.promise) this.promise=new Promise((resolve,reject)=>{
      if (!this.factory) return reject(Error('当前浏览器不支持作业存储，请更换浏览器'));
      const request=this.factory.open('material-center-batches-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('batches',{keyPath:'batch_id'});
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
      request.onerror=()=>reject(Error('作业存储不可用：'+request.error?.message));
      request.onblocked=()=>reject(Error('作业存储升级被其他页面阻塞，请关闭旧页面后重试'));
    }).catch(error=>{this.promise=undefined;throw error;});
    return this.promise;
  }
  async transact(mode, action) {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('batches',mode);let value;
      const request=action(tx.objectStore('batches'));
      request.onsuccess=()=>{value=request.result;};
      tx.oncomplete=()=>resolve(value);
      tx.onerror=tx.onabort=()=>reject(Error('作业或文件未能保存：'+(tx.error?.message || '存储空间不足或事务被中止')));
    });
  }
  get(id) { return this.transact('readonly',store=>store.get(id)); }
  put(batch) { return this.transact('readwrite',store=>store.put(batch)); }
  async list() {
    const {summarize}=await import('./batch.js');
    return (await this.transact('readonly',store=>store.getAll())).map(batch=>({...summarize(batch),updated_at:batch.updated_at})).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  }
}
