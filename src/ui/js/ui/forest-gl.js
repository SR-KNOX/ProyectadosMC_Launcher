// Fondo "bosque oscuro" en WebGL (shaders): nebulosa, esfera luminosa con bloom, rayos, niebla volumétrica,
// suelo de bloques con reflejo, árboles cúbicos por capas, jefe encapuchado con luz de contraluz y partículas.
// Bucle perfecto: TODA animación usa la fase `ph` (0..2π) con ciclos enteros → el último fotograma enlaza con el primero.
// Si WebGL no está disponible, background.js usa el fondo por canvas 2D (forest.js).

const LOOP_SECONDS = 24;
const TAU = Math.PI * 2;

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 R;
uniform float ph;
const float TAU=6.2831853;
const vec3 FOG=vec3(.03,.11,.15);

float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}
vec2 orbit(float k){return vec2(cos(ph*k),sin(ph*k));}
float bx(vec2 p,vec2 c,vec2 hs){vec2 d=abs(p-c)-hs;return step(max(d.x,d.y),0.);}

// ---- Árboles cúbicos por capas: x = máscara, y = tono, z = 1 si es tronco ----
vec3 treeLayer(vec2 p,float w,float dens,float base,float hmin,float hvar,float b,float seed){
  float id=floor(p.x/w);
  float xi=p.x/w-id;
  float h=h21(vec2(id,seed));
  float cx=.5+(h21(vec2(id,seed+9.))-.5)*.14;
  float ex=step(1.-dens,h21(vec2(id+3.,seed+1.)));
  float th=base+hmin+hvar*h21(vec2(id,seed+2.));
  float tw=w*(.055+.045*h);
  float dx=(xi-cx)*w;
  float trunk=step(abs(dx),tw)*step(base,p.y)*step(p.y,th);
  float cs=w*.36;
  float cw1=w*(.32+.06*h);
  float c1=step(abs(dx),cw1)*step(th-cs*.9,p.y)*step(p.y,th+cs*.2);
  float c2=step(abs(dx),cw1*.62)*step(th+cs*.2,p.y)*step(p.y,th+cs*.8);
  float c3=step(abs(dx),cw1*1.15)*step(th-cs*1.5,p.y)*step(p.y,th-cs*.9);
  vec2 cell=floor(p/b);
  float lf=step(.14,h21(cell+seed));
  float leaves=max(max(c1,c2),c3)*lf;
  float shade=.35+.65*h21(cell+seed+3.);
  float stripe=.7+.3*h21(vec2(floor(dx/(tw*.6)),seed));
  float m=max(trunk,leaves)*ex;
  float tone=mix(shade,stripe*.5,trunk*(1.-leaves));
  return vec3(m,tone,trunk*(1.-leaves)*ex);
}

// ---- Árbol gigante de primer plano (borde de pantalla) ----
float nearTree(vec2 p,float tx,float hw,float cw,float ytop){
  float dx=p.x-tx;
  float trunk=step(abs(dx),hw)*step(p.y,ytop+.02);
  float rag=ytop+.07*h21(vec2(floor(p.x/.04),4.));
  float can=step(abs(dx),cw)*step(rag,p.y)*step(p.y,1.02)*step(.12,h21(floor(p/.03)+2.));
  return max(trunk,can);
}

// ---- Jefe encapuchado visto de espaldas (coordenadas locales: altura total ≈ 1) ----
float bladeShape(vec2 b,out float ang,out float len,out float thick){
  vec2 cb=vec2(-.17,.72);
  vec2 d=b-cb;
  len=length(d);
  ang=atan(d.y,d.x);
  float t=clamp((ang-.15)/1.6,0.,1.);
  thick=.01+.04*t;
  float R0=.28;
  return step(abs(len-(R0-thick*.5)),thick*.5)*step(.15,ang)*step(ang,1.75);
}
float bossMask(vec2 b){
  float sway=sin(ph*2.+b.x*18.)*.012*(1.-clamp(b.y/.6,0.,1.));
  float x=b.x+sway,y=b.y;
  float hem=.04*h21(vec2(floor(b.x*34.),3.));
  float hw=.095+.115*(1.-clamp(y/.62,0.,1.));
  float cloak=step(abs(x),hw)*step(hem,y)*step(y,.64);
  float sh=bx(vec2(x,y),vec2(0.,.62),vec2(.17,.04));
  float sp=step(abs(x),.19)*step(.12,abs(x))*step(.6,y)*step(y,.64+(abs(x)-.12)*1.4);
  float hood=step(abs(x),.075)*step(.62,y)*step(y,.82)+step(abs(x),.052)*step(.82,y)*step(y,.89);
  float staff=step(abs(x+.17),.008)*step(.02,y)*step(y,1.0);
  float hand=bx(vec2(x,y),vec2(-.17,.38),vec2(.026,.03));
  float a,l,t;
  float bl=bladeShape(b,a,l,t);
  return min(1.,cloak+sh+sp+hood+staff+hand+bl);
}

void main(){
  vec2 uv=gl_FragCoord.xy/R;
  float asp=R.x/R.y;
  vec2 p=vec2(uv.x*asp,uv.y);
  float port=step(asp,1.1);
  vec2 oc=mix(vec2(.63*asp,.60),vec2(.5*asp,.64),port);
  float orad=mix(.27,.19,port);
  float yh=mix(.36,.40,port);
  float bxp=mix(.62*asp,.5*asp,port);
  float bh=mix(.56,.34,port);
  float foot=mix(.075,.14,port);

  // ---------- Cielo: degradado + nebulosa + estrellas ----------
  float hy=clamp((p.y-yh)/(1.-yh),0.,1.);
  vec3 col=mix(vec3(.012,.05,.09),vec3(.003,.008,.025),pow(hy,.6));
  vec2 np=p*vec2(1.3,2.0);
  float n1=fbm(np+.9*orbit(1.));
  float n2=fbm(np*1.7+vec2(5.2,1.3)+.6*orbit(2.)+vec2(0.,0.));
  float neb=smoothstep(.35,.85,n1)*(.4+.6*n2);
  col+=neb*mix(vec3(.01,.07,.16),vec3(.02,.15,.2),n2)*(.5+.5*hy)*.8;
  vec2 sc=p*110.;
  vec2 sid=floor(sc);
  float hs=h21(sid);
  float kk=1.+floor(fract(hs*37.)*3.);
  float star=step(.982,hs)*smoothstep(.35,0.,length(fract(sc)-.5))*(.55+.45*sin(ph*kk+hs*TAU));
  col+=vec3(.6,.9,1.)*star*smoothstep(yh,yh+.15,p.y);

  // ---------- Esfera luminosa ----------
  vec2 dp=p-oc;
  float dl=length(dp);
  float r=dl/orad;
  col+=vec3(.04,.5,.58)*(exp(-max(r-1.,0.)*2.6)*.55+.22/(1.+r*r*1.5))*.6;
  if(r<1.){
    float z=sqrt(1.-r*r);
    vec3 body=vec3(.01,.06,.09)*(.6+.8*z);
    float rim=pow(1.-z,2.5);
    float ang=atan(dp.y,dp.x)/TAU+.5;
    float ri=floor(r*9.);
    float nw=6.*(ri+1.);
    vec2 cid=vec2(floor(ang*nw),ri);
    vec2 cf=vec2(fract(ang*nw),fract(r*9.));
    float hc=h21(cid+ri*13.);
    float on=step(.55,hc)*step(.12,cf.x)*step(cf.x,.88)*step(.25,cf.y)*step(cf.y,.8);
    float pulse=.55+.45*sin(ph*(1.+floor(h21(cid+7.)*3.))+hc*TAU);
    vec3 lit=mix(vec3(.2,.9,.8),vec3(.6,1.,.45),h21(cid+3.))*on*pulse;
    body*=.75+.25*step(.06,cf.y);
    col=body+vec3(.1,.95,.9)*rim*1.3+lit*(.5+.7*z);
  }

  // ---------- Suelo: bloques en perspectiva, camino de piedra, reflejo y hongos ----------
  if(p.y<yh){
    float dy=yh-p.y;
    float X=(p.x-bxp)/(dy+.01);
    float Z=.12/(dy+.01);
    vec2 gc=vec2(X*4.,Z*10.);
    vec2 gid=floor(gc),gf=fract(gc);
    float gh=h21(gid);
    vec3 gcol=mix(vec3(.008,.035,.045),vec3(.018,.06,.075),gh);
    float onPath=smoothstep(.5,.4,abs(X)+(gh-.5)*.12);
    vec3 pcol=mix(vec3(.05,.09,.13),vec3(.14,.2,.27),gh);
    float seam=step(.07,gf.x)*step(.07,gf.y);
    vec3 g=mix(gcol,pcol,onPath)*(.7+.3*seam);
    // reflejo de la esfera (ondulado)
    vec2 d2=p-vec2(oc.x,2.*yh-oc.y);
    d2.x+=(fbm(vec2(p.x*8.,p.y*30.)+orbit(2.))-.5)*.035;
    float r2=length(vec2(d2.x*.9,d2.y*.55))/orad;
    g+=vec3(.04,.5,.5)*.22/(1.+r2*r2*3.)*smoothstep(0.,.1,dy)*(.45+onPath);
    // hongos luminosos
    vec2 mc=vec2(X*1.6,Z*4.);
    vec2 mid=floor(mc);
    float mh=h21(mid+11.);
    float offp=step(.55,abs(X));
    vec2 mf=fract(mc)-.5-(h21(mid+5.)-.5)*.5;
    float md=length(mf*vec2(1.,1.4));
    float mpulse=.6+.4*sin(ph*2.+mh*TAU);
    g+=vec3(.25,1.,.8)*(exp(-md*14.)+smoothstep(.1,.04,md))*mpulse*step(.93,mh)*offp*.8*smoothstep(0.,.1,dy);
    // sombra del jefe
    vec2 sd=(p-vec2(bxp,foot))/vec2(bh*.2,.02);
    g*=1.-.65*exp(-dot(sd,sd));
    // niebla de distancia
    g=mix(FOG*.55,g,smoothstep(0.,.14,dy));
    col=g;
  }
  col+=vec3(.02,.1,.14)*exp(-abs(p.y-yh)*14.)*.6;

  // ---------- Árboles lejanos ----------
  vec3 t=treeLayer(p,.13,.95,yh-.0,.12,.14,.012,5.);
  vec3 tcol=mix(vec3(.02,.09,.11),vec3(.035,.14,.16),t.y);
  tcol=mix(tcol,FOG*.9,.45);
  col=mix(col,tcol,t.x);
  // niebla A (entre lejanos y medios)
  float fa=smoothstep(.45,.8,fbm(vec2(p.x*2.2,p.y*6.)+orbit(1.)*1.2))*exp(-abs(p.y-(yh+.04))*7.)*.6;
  col=mix(col,vec3(.04,.14,.2),fa);

  // ---------- Rayos de luz desde la esfera ----------
  float a=atan(dp.y,dp.x);
  float ray=pow(vn(vec2(cos(a),sin(a))*4.+orbit(1.)*.7),3.)*2.;
  col+=vec3(.04,.4,.45)*ray*exp(-max(dl-orad,0.)*2.2)*smoothstep(0.,.05,dl-orad)*.45;

  // ---------- Árboles medios ----------
  vec3 m=treeLayer(p,.22,.85,yh-.05,.20,.25,.02,17.);
  vec3 mcol=mix(vec3(.012,.06,.08),vec3(.03,.11,.13),m.y);
  mcol=mix(mcol,FOG*.9,.2);
  col=mix(col,mcol,m.x);
  vec3 m2=treeLayer(p,.4,.7,yh-.09,.28,.3,.034,31.);
  vec3 m2c=mix(vec3(.006,.03,.045),vec3(.018,.07,.09),m2.y);
  col=mix(col,m2c,m2.x);

  // ---------- Jefe ----------
  vec2 b=(p-vec2(bxp,foot))/bh;
  b.y+=.008*sin(ph*5.);
  if(abs(b.x)<.5&&b.y>-.05&&b.y<1.15){
    float mk=bossMask(b);
    if(mk>0.){
      float al,le,th;
      float bl=bladeShape(b,al,le,th);
      vec3 bc=mix(vec3(.01,.02,.045),vec3(.02,.06,.09),b.y*.5)+h21(vec2(floor(b.x*60.),1.))*.012;
      // luz de contraluz: borde brillante donde el vecino ya no es jefe
      float inner=bossMask(b+vec2(.008,.004))*bossMask(b+vec2(-.008,.004))*bossMask(b+vec2(0.,.01));
      float rimb=mk*(1.-inner);
      bc+=vec3(.3,.95,.95)*rimb*.9;
      // filo de la guadaña + destello (una vez cada 6 s)
      float edge=bl*smoothstep(.012,0.,(.28-th)-le+.012);
      float tt=fract(ph/TAU*4.);
      float gA=mix(1.75,.15,smoothstep(0.,.25,tt));
      float glint=bl*smoothstep(.22,0.,abs(al-gA))*step(tt,.3);
      bc+=vec3(.75,1.,1.)*(edge*.9+glint*1.6);
      // runa de la espalda
      float rn=abs(b.x)+abs(b.y-.36);
      float rune=smoothstep(.014,0.,abs(rn-.045))*(.6+.4*sin(ph*3.));
      bc+=vec3(.3,1.,.9)*rune*step(b.y,.6)*step(abs(b.x),.2);
      // hilos de luz bajo el dobladillo
      float drip=step(b.y,.07)*step(.7,h21(vec2(floor(b.x*40.),8.)));
      bc+=vec3(.15,.8,.85)*drip*.8;
      col=mix(col,bc,mk);
    }
    // destello cian que sube del jefe
    col+=vec3(.1,.7,.8)*exp(-length((b-vec2(0.,.1))*vec2(2.,1.))*3.)*.07;
  }

  // ---------- Niebla B (suelo) ----------
  float fb=smoothstep(.4,.85,fbm(vec2(p.x*1.6+4.,p.y*5.)+orbit(1.)*1.4+vec2(2.,0.)))*exp(-abs(p.y-(yh-.04))*6.)*.7;
  col=mix(col,vec3(.035,.13,.18),fb);

  // ---------- Árboles gigantes de primer plano ----------
  float tx=mix(.03,.015,port);
  float nw=mix(.04,.025,port);
  float ncw=mix(.24,.1,port);
  float nt=max(nearTree(p,tx,nw,ncw,.78),nearTree(vec2(asp-p.x,p.y),tx,nw,ncw,.78));
  vec3 ncol=vec3(.004,.016,.026)+vec3(.0,.02,.02)*h21(floor(p/.04));
  col=mix(col,ncol,nt);

  // ---------- Partículas: luciérnagas y motas que suben ----------
  for(int i=0;i<24;i++){
    float fi=float(i);
    float s1=h21(vec2(fi,1.)),s2=h21(vec2(fi,2.)),s3=h21(vec2(fi,3.));
    vec2 q;float amp;
    if(i<12){
      q=vec2(s1*asp+.04*sin(ph*2.+fi*1.7),.08+s2*.5+.03*sin(ph*3.+fi));
      amp=1.;
    }else{
      float k=1.+floor(s3*3.);
      q=vec2(s1*asp+.02*sin(ph*4.+fi),fract(s2+ph/TAU*k)*.95);
      amp=.55;
    }
    vec2 dd=p-q;
    float tw=.5+.5*sin(ph*(2.+floor(s3*3.))+fi*2.);
    float g=min(.00005/(dot(dd,dd)+.00002),1.5);
    col+=mix(vec3(.2,1.,.8),vec3(.6,1.,.3),s3)*g*tw*amp*.5;
  }

  // ---------- Acabado: tono, viñeta y dither ----------
  col=1.-exp(-col*1.1);
  col*=mix(1.,.45,smoothstep(.4,1.1,length((uv-.5)*vec2(1.,1.1))));
  col+=(h21(gl_FragCoord.xy)-.5)/255.;
  gl_FragColor=vec4(col,1.);
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log || 'shader');
  }
  return s;
}

/** Monta el fondo WebGL en el canvas. Devuelve false si no es posible (el llamador usa el respaldo 2D). */
export function mountForestGL(canvas, opts = {}) {
  let gl;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve })
      || canvas.getContext('experimental-webgl');
    if (!gl) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(prog, 'R');
    var uPh = gl.getUniformLocation(prog, 'ph');
  } catch (e) {
    console.warn('WebGL no disponible, uso el fondo 2D:', e.message);
    return false;
  }

  canvas.style.imageRendering = 'auto';
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

  function size() {
    const vh = Math.max(innerHeight, 1), vw = Math.max(innerWidth, 1);
    const s = Math.min(1, (opts.height || 640) / vh);
    canvas.width = Math.max(2, Math.round(vw * s));
    canvas.height = Math.max(2, Math.round(vh * s));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  function render(seconds) {
    gl.uniform2f(uR, canvas.width, canvas.height);
    gl.uniform1f(uPh, ((seconds % LOOP_SECONDS) / LOOP_SECONDS) * TAU);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  canvas.__render = render; // para pruebas

  let last = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (now - last < 33) return; // ~30 fps
    last = now;
    render(now / 1000);
  }

  size();
  addEventListener('resize', () => { size(); if (reduce) render(0); });
  if (reduce) render(0); else requestAnimationFrame(tick);
  return true;
}
