import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL("../../"+path, import.meta.url), "utf8");
test("robots sitemap only exposes public storefront, never customer/admin URLs",()=>{
 const robots=read("robots.txt"),xml=read("sitemap.xml");
 assert.match(robots,/User-agent: \*/);
 assert.match(robots,/Sitemap: https:\/\/selectshopeg\.com\/sitemap\.xml/);
 for(const path of ["admin","cart","checkout","order-success"]){
  assert.match(robots,new RegExp("Disallow: /"+path+"/"));
  assert.equal(xml.includes("/"+path+"/"),false);
 }
 assert.match(xml,/<loc>https:\/\/selectshopeg\.com\/<\/loc>/);
 assert.equal((xml.match(/<loc>/g)||[]).length,1);
});
test("homepage has canonical and checkout pages carry noindex",()=>{
 assert.match(read("index.html"),/<link rel="canonical" href="https:\/\/selectshopeg\.com\/"/);
 assert.match(read("admin/index.html"),/name="robots" content="noindex, nofollow"/);
 assert.match(read("checkout/index.html"),/name="robots" content="noindex/);
 assert.match(read("cart/index.html"),/name="robots" content="noindex/);
 assert.match(read("order-success/index.html"),/name="robots" content="noindex/);
});
