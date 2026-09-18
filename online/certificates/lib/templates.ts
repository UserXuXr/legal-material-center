import catalog from '../catalog.json';
import metrics from '../font-metrics.json';
const images=import.meta.glob('../../public/certificate-assets/*.png',{eager:true,query:'?inline',import:'default'}) as Record<string,string>;
export type Project={version:1;template_id:string;name:string;values:Record<string,string>;capture:'native'|'raster_200dpi';issuer_scope:string;as_of:string;id?:string;updated_at?:string;preserveMissing?:boolean;templateDate?:string};
export type Template={id:string;title:string;subtitle:string;kind:string;medium:string;valid_from:string;valid_through:string|null;page_mm:number[];paper:string;issuer_scopes:string[];fields:{key:string;label:string;type:string;group:string}[];example:Project;scope_note:string;elements:any[];revision:string;template_hash:string};
export const templates=catalog as unknown as Template[];
export {metrics};
export const backgroundFor=(id:string)=>images[`../../public/certificate-assets/${id}.png`];
