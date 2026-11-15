import { chromium } from 'playwright';

const models = ['anime4k-v4-s-2x','anime4k-v4-m-2x','anime4k-v4-l-2x'];
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl'],
});
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[browser error]', e.message));
  await page.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  for (const model of models) {
    const result = await page.evaluate(async modelId => {
      try {
        const { upscaleAnime4K } = await import('/src/lib/upscalers/anime4k.ts');
        const canvas = document.createElement('canvas');
        canvas.width = 5;
        canvas.height = 3;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#8060cf';
        ctx.fillRect(0,0,5,3);
        ctx.fillStyle = '#ffff11';
        ctx.fillRect(2,1,3,2);
        const src = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
        const result = await upscaleAnime4K(new File([src],'anime.png',{type:'image/png'}),modelId);
        const img = await createImageBitmap(result);
        const width = img.width, height = img.height;
        img.close();
        return {ok:result.type==='image/png' && result.size > 70 && width===10 && height===6,bytes:result.size,width,height};
      } catch (error) {
        return {ok:false,error:error instanceof Error ? error.stack || error.message : String(error)};
      }
    },model);
    console.log(model,result);
    if(!result.ok)throw new Error(model+' did not produce correct GPU result: '+JSON.stringify(result));
  }
} finally {
  await browser.close();
}
