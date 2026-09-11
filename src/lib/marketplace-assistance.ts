import { marketplaceTakeHome } from "./marketplace-settings";
// Evidence and arithmetic are independent of any future language-model provider.
export type Parcel = { weight: number | null; length: number | null; width: number | null; height: number | null };
export type DeliveryOption = { id: string; name: string; fee: number; boxCost: number | null; maxWeight?: number | null; maxTotal?: number | null; maxLength?: number | null; maxWidth?: number | null; maxHeight?: number | null; minLength?: number; minWidth?: number; source: string | null; checkedAt: string | null; note: string };
export const SHIPPING_GUIDES: Record<string,string> = {
  mercari: "https://help.jp.mercari.com/guide/categories/1424/",
  rakuma: "https://faq.fril.jp/hc/ja/articles/38949391411981",
  yahoo_furima: "https://paypayfleamarket.yahoo.co.jp/contents/shipping",
};
export const OFFICIAL_MERCARI_RATES: DeliveryOption[] = [
  {id:"mercari-nekopos",name:"ネコポス",fee:210,boxCost:null,maxWeight:1000,maxTotal:60,maxLength:34,maxHeight:3,minLength:23,minWidth:11.5,source:"https://help.jp.mercari.com/guide/articles/134/",checkedAt:"2026-09-10",note:"封筒・袋は別途。梱包後の最小サイズにも注意。"},
  {id:"mercari-compact",name:"宅急便コンパクト（専用BOX）",fee:450,boxCost:70,maxLength:25,maxWidth:20,maxHeight:5,source:"https://help.jp.mercari.com/guide/articles/135/",checkedAt:"2026-09-10",note:"新品の専用BOXに無理なく収まることを確認。外寸での目安です。集荷料は別途。"},
  ...([[60,2000,750],[80,5000,850],[100,10000,1050],[120,15000,1200],[140,20000,1450],[160,25000,1700],[180,30000,2100],[200,30000,2500]] as const).map(([size,weight,fee])=>({id:`mercari-takkyubin-${size}`,name:`宅急便 ${size}サイズ`,fee,boxCost:null,maxTotal:size,maxWeight:weight,maxLength:170,source:"https://help.jp.mercari.com/guide/articles/136/",checkedAt:"2026-09-10",note:"箱・緩衝材、集荷料は別途。天地指定は長辺100cm以内。180・200サイズは営業所または集荷。"})),
];
export function officialRates(channel:string):DeliveryOption[] {
  if(channel==="mercari")return OFFICIAL_MERCARI_RATES;
  if(channel==="yahoo_furima")return OFFICIAL_MERCARI_RATES.map((r,i)=>({...r,id:r.id.replace("mercari","yahoo"),name:i===1?"宅急便コンパクト（EAZY・専用BOX）":r.name,fee:i===1?490:i===6?1400:r.fee,source:SHIPPING_GUIDES.yahoo_furima,note:i===0?r.note:i===1?"専用BOX代70円〜。サイズ・購入価格を確認。集荷は別途50円。":"梱包費・集荷料は別途。発送場所のサイズ上限を確認してください。"}));
  if(channel==="rakuma")return OFFICIAL_MERCARI_RATES.map((r,i)=>({...r,id:r.id.replace("mercari","rakuma"),fee:[200,430,650,750,1050,1200,1400,1500,2800,3350][i],source:"https://faq.fril.jp/hc/ja/articles/39120722011405",note:(i===0?"商品価格300円以上。":i===1?"商品価格470円以上。専用BOX代70円。":"商品価格750円以上。梱包費は別途。")+" かんたんラクマパックで送料込みの出品が必要。発送場所・サイズ条件を確認してください。"}));
  return [];
}
export function parcelFit(parcel:Parcel, option:DeliveryOption):"MATCH"|"UNKNOWN"|"NO" {
  if(!option.maxWeight&&!option.maxTotal&&!option.maxLength&&!option.maxWidth&&!option.maxHeight)return "UNKNOWN";
  const dims=[parcel.length,parcel.width,parcel.height].filter((n):n is number=>n!==null).sort((a,b)=>b-a);
  if(option.maxWeight && parcel.weight!==null && parcel.weight>option.maxWeight)return "NO";
  if(dims.length!==3 || parcel.weight===null)return "UNKNOWN";
  const [length,width,height]=dims;
  if((option.maxTotal && length+width+height>option.maxTotal)||(option.maxLength&&length>option.maxLength)||(option.maxWidth&&width>option.maxWidth)||(option.maxHeight&&height>option.maxHeight)||(option.minLength&&length<option.minLength)||(option.minWidth&&width<option.minWidth))return "NO";
  return "MATCH";
}
export function median(values:number[]):number|null { const sorted=values.filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);if(!sorted.length)return null;const mid=Math.floor(sorted.length/2);return Math.round(sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2); }
export function minimumUnitPrice(cost:number,quantity:number,feeBps:number,targetBps:number):number|null {
  const remainder=10000-feeBps-targetBps;
  if(remainder<=0||quantity<=0)return null;
  return Math.ceil(cost*10000/remainder/quantity);
}
export function proposalNumbers(input:{history:number[];acquisitionCost:number|null;quantity:number;shipping:number;packaging:number|null;feeBps:number|null;targetBps:number}) {
  const observed=median(input.history);
  const known=input.acquisitionCost!==null&&input.packaging!==null&&input.feeBps!==null;
  const costs=(input.acquisitionCost??0)*input.quantity+input.shipping+(input.packaging??0);
  const minimum=known?minimumUnitPrice(costs,input.quantity,input.feeBps!,input.targetBps):null;
  const price=observed??minimum;
  const profit=price!==null&&known?price*input.quantity-Math.ceil(price*input.quantity*input.feeBps!/10000)-costs:null;
  const takeHome = price === null ? null : marketplaceTakeHome(price, input.quantity, input.feeBps, input.shipping, input.packaging);
  return {price,minimum,profit,takeHome,source:observed!==null?"HISTORY":minimum!==null?"COST":"UNKNOWN",sampleCount:input.history.length};
}
