function installDimensionBoost(){
  if(!globalThis.CanvasRenderingContext2D?.prototype?.fillText)return;
  const proto=CanvasRenderingContext2D.prototype;
  if(proto.fillText.__ggDimensionBoost)return;
  const original=proto.fillText;
  function boosted(text,x,y,maxWidth){
    const value=String(text||'');
    const isDimension=/^[ABC]\s*·\s*.+\s(?:cm|m|mm)$/i.test(value);
    if(!isDimension)return maxWidth===undefined?original.call(this,text,x,y):original.call(this,text,x,y,maxWidth);
    const previousFont=this.font;
    const match=/^(.*?)(\d+(?:\.\d+)?)px\s+(.+)$/.exec(previousFont);
    if(match){
      const px=Math.max(70,Number(match[2])*1.4);
      this.font=`${match[1]}${px}px ${match[3]}`;
    }
    const result=maxWidth===undefined?original.call(this,text,x,y):original.call(this,text,x,y,maxWidth);
    this.font=previousFont;
    return result;
  }
  boosted.__ggDimensionBoost=true;
  proto.fillText=boosted;

  const style=document.createElement('style');
  style.textContent=`
    #dimensionValues span{font-size:18px!important;font-weight:800!important;padding:10px 12px!important;min-height:46px!important}
    .dimension-head strong{font-size:15px!important}
    .dimensions-active #dimensionPanel{padding:14px 16px!important}
    @media(max-width:760px){#dimensionValues span{font-size:16px!important;min-height:46px!important}.dimension-head strong{font-size:14px!important}}
  `;
  document.head.appendChild(style);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDimensionBoost);else installDimensionBoost();
