import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir:'e2e',testMatch:'live-sales-readonly.spec.mjs',workers:1,retries:0,
 reporter:'list',timeout:35000,
 use:{trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[
  {name:'mobile',use:{...devices['Pixel 7']}},
  {name:'desktop',use:{...devices['Desktop Chrome']}}
 ]
});
