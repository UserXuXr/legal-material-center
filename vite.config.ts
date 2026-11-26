import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import {resolve} from 'node:path';
export default defineConfig({root:'online',base:process.env.VITE_BASE_PATH || '/',plugins:[react()],css:{postcss:{plugins:[tailwindcss()]}},build:{outDir:'../dist/client',emptyOutDir:true,rollupOptions:{input:{'reference-edit':resolve('online/reference-edit/index.html'),scans:resolve('online/scans/index.html'),screenshots:resolve('online/screenshots/index.html'),materials:resolve('online/materials/index.html'),business:resolve('online/business/index.html'),batch:resolve('online/batch/index.html'),center:resolve('online/index.html'),contracts:resolve('online/contracts/index.html'),finance:resolve('online/finance/index.html'),rights:resolve('online/rights/index.html'),certificates:resolve('online/certificates/index.html')}}},server:{watch:{useFsEvents:false,usePolling:true}}});
