export interface HidCollection { usagePage: number; usage: number; outputReports: Array<{reportId:number}>; inputReports: Array<{reportId:number}>; children: HidCollection[] }
export interface WebHidDevice extends EventTarget {
  vendorId:number; productId:number; productName:string; opened:boolean; collections:HidCollection[]
  open():Promise<void>; close():Promise<void>; sendReport(id:number,data:Uint8Array):Promise<void>
}
export interface WebHid extends EventTarget { getDevices():Promise<WebHidDevice[]>; requestDevice(options:{filters:Array<{vendorId:number;usagePage:number;usage:number}>}):Promise<WebHidDevice[]> }
export function webHid(): WebHid | undefined { return (navigator as Navigator & {hid?:WebHid}).hid }
export function compatible(device:WebHidDevice):boolean {
  return device.vendorId===0x3537 && device.collections.some(c=>c.usagePage===0xfff0&&c.usage===0x40&&c.outputReports.some(r=>r.reportId===15))
}
