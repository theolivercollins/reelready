exports.id=150,exports.ids=[150],exports.modules={6487:()=>{},6509:(a,b,c)=>{"use strict";c.d(b,{a:()=>t});var d=c(7168),e=c(7143);let f=`You are a real estate photography analyst specializing in AI video generation.

For each image, evaluate its suitability for creating smooth, cinematic AI-generated video clips. Your analysis directly determines which photos get selected and how they're animated.

EVALUATION CRITERIA:

1. quality_score (1-10): Technical quality
   - Sharpness and focus
   - Proper exposure and white balance
   - Resolution and noise levels
   - Professional staging and cleanliness
   Rate conservatively — 8+ should be genuinely impressive.

2. aesthetic_score (1-10): Cinematic potential when animated
   - Strong compositional lines (leading lines, symmetry, framing)
   - Good depth and layering (foreground/midground/background)
   - Interesting lighting (natural light, dramatic shadows, warm tones)
   - Visual storytelling — does this photo "sell" the space?
   Rate based on how good the ANIMATED result will look, not just the static photo.

3. depth_rating: How much 3D depth the image contains
   - "high": Clear foreground/background separation, strong perspective lines, objects at multiple depths (ideal for parallax)
   - "medium": Some depth but relatively flat composition
   - "low": Flat, head-on shot with minimal depth cues (avoid for parallax, use slow pan)

4. room_type: Classify the space shown. Use one of: kitchen, living_room, master_bedroom, bedroom, bathroom, exterior_front, exterior_back, pool, aerial, dining, hallway, garage, foyer, other

5. key_features: 2-4 notable features visible (e.g., "granite island", "vaulted ceiling", "natural light", "pool view")

6. suggested_discard: true if the photo should NOT be used for video generation:
   - Too dark or overexposed
   - Blurry or out of focus
   - Extreme fisheye/wide-angle distortion
   - Shows clutter, people, or construction
   - Duplicate angle of a better photo (note: you'll see all photos from this property)
   - Tight/cramped space that will distort when animated

If discarding, provide a brief discard_reason.

IMPORTANT: Return a JSON array with one object per image, in the same order as the images provided.`,g=`You are a real estate cinematographer planning a 30-second property walkthrough video. You receive a set of analyzed property photos with metadata and must create an ordered shot list.

STRUCTURE (beginning → middle → end):
- Opening: Exterior establishing shot (orbital or slow dolly) — 4 seconds
- Transition into the interior through the front-facing areas
- Flow through main living spaces (living room → kitchen → dining)
- Bedrooms and bathrooms
- Highlight shot (pool, view, unique architectural feature) — if available
- Closing: Exterior wide or aerial — 3-4 seconds

CAMERA MOVEMENT RULES (match to room type):
- exterior_front / exterior_back: orbital_slow (slow rotation around subject)
- aerial: orbital_slow or slow_pan
- kitchen: dolly_left_to_right (follows counter/island line)
- living_room: dolly_right_to_left or slow_pan (emphasize depth and openness)
- master_bedroom: dolly_right_to_left (bed as anchor point)
- bedroom: slow_pan (simple, clean movement)
- bathroom: slow_pan (compact spaces need gentle movement)
- dining: dolly_left_to_right (table as anchor)
- pool / outdoor: parallax (foreground foliage, background water)
- hallway / foyer: push_in (create depth and draw viewer forward)
- garage: slow_pan

DEPTH-BASED OVERRIDES:
- Photos with depth_rating "high": prefer parallax if room type allows it
- Photos with depth_rating "low": ONLY use slow_pan (less 3D = more warping with complex movements)

PROMPT WRITING RULES:
- Start with "Cinematic" and the camera movement description
- Include specific architectural/design details visible in the photo
- Mention lighting conditions (natural light, golden hour, bright and airy, etc.)
- End with "smooth steady camera movement, photorealistic"
- Keep prompts under 60 words
- Never mention people, personal items, or brand names

DURATION GUIDELINES:
- Exterior establishing: 4 seconds
- Interior rooms: 3-3.5 seconds
- Highlight features: 3.5-4 seconds
- Closing: 3-4 seconds
- Total video should be 28-35 seconds

TARGET: Select 10-12 scenes for a 30-second video. You do NOT need to use every photo.`;class h{constructor(){this.name="runway",this.baseUrl="https://api.dev.runwayml.com/v1";let a=process.env.RUNWAY_API_KEY;if(!a)throw Error("RUNWAY_API_KEY is required");this.apiKey=a}async generateClip(a){let b=a.sourceImage.toString("base64"),c=`data:image/jpeg;base64,${b}`,d=await fetch(`${this.baseUrl}/image_to_video`,{method:"POST",headers:{Authorization:`Bearer ${this.apiKey}`,"Content-Type":"application/json","X-Runway-Version":"2024-11-06"},body:JSON.stringify({model:"gen4_turbo",promptImage:c,promptText:a.prompt,duration:Math.min(Math.max(Math.round(a.durationSeconds),5),10),ratio:"16:9"===a.aspectRatio?"1280:720":"720:1280"})});if(!d.ok){let a=await d.text();throw Error(`Runway API error: ${d.status} ${a}`)}return{jobId:(await d.json()).id,estimatedSeconds:90}}async checkStatus(a){let b=await fetch(`${this.baseUrl}/tasks/${a}`,{headers:{Authorization:`Bearer ${this.apiKey}`,"X-Runway-Version":"2024-11-06"}});if(!b.ok)throw Error(`Runway status check failed: ${b.status}`);let c=await b.json();return"SUCCEEDED"===c.status&&c.output?.[0]?{status:"complete",videoUrl:c.output[0]}:"FAILED"===c.status?{status:"failed",error:c.failure??"Unknown error"}:{status:"processing"}}async downloadClip(a){let b=await fetch(a);if(!b.ok)throw Error(`Download failed: ${b.status}`);return Buffer.from(await b.arrayBuffer())}}var i=c(5511);class j{constructor(){this.name="kling",this.baseUrl="https://api.klingai.com/v1";let a=process.env.KLING_ACCESS_KEY,b=process.env.KLING_SECRET_KEY;if(!a||!b)throw Error("KLING_ACCESS_KEY and KLING_SECRET_KEY are required");this.accessKey=a,this.secretKey=b}generateJWT(){let a=Math.floor(Date.now()/1e3),b={iss:this.accessKey,exp:a+1800,nbf:a-5},c=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),d=Buffer.from(JSON.stringify(b)).toString("base64url"),e=i.createHmac("sha256",this.secretKey).update(`${c}.${d}`).digest("base64url");return`${c}.${d}.${e}`}getAuthHeaders(){return{Authorization:`Bearer ${this.generateJWT()}`,"Content-Type":"application/json"}}async generateClip(a){let b=a.sourceImage.toString("base64"),c=await fetch(`${this.baseUrl}/videos/image2video`,{method:"POST",headers:this.getAuthHeaders(),body:JSON.stringify({model_name:"kling-v2",image:b,prompt:a.prompt,duration:String(Math.round(a.durationSeconds)),aspect_ratio:a.aspectRatio,mode:"pro"})});if(!c.ok){let a=await c.text();throw Error(`Kling API error: ${c.status} ${a}`)}return{jobId:(await c.json()).data.task_id,estimatedSeconds:120}}async checkStatus(a){let b=await fetch(`${this.baseUrl}/videos/image2video/${a}`,{headers:this.getAuthHeaders()});if(!b.ok)throw Error(`Kling status check failed: ${b.status}`);let c=(await b.json()).data;return"succeed"===c.task_status&&c.task_result?.videos?.[0]?{status:"complete",videoUrl:c.task_result.videos[0].url}:"failed"===c.task_status?{status:"failed",error:c.task_status_msg??"Unknown error"}:{status:"processing"}}async downloadClip(a){let b=await fetch(a);if(!b.ok)throw Error(`Download failed: ${b.status}`);return Buffer.from(await b.arrayBuffer())}}class k{constructor(){this.name="luma",this.baseUrl="https://api.lumalabs.ai/dream-machine/v1";let a=process.env.LUMA_API_KEY;if(!a)throw Error("LUMA_API_KEY is required");this.apiKey=a}async generateClip(a){let b=a.sourceImage.toString("base64"),c=`data:image/jpeg;base64,${b}`,d=await fetch(`${this.baseUrl}/generations`,{method:"POST",headers:{Authorization:`Bearer ${this.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({prompt:a.prompt,keyframes:{frame0:{type:"image",url:c}},model:"ray2",duration:`${Math.round(a.durationSeconds)}s`,aspect_ratio:a.aspectRatio})});if(!d.ok){let a=await d.text();throw Error(`Luma API error: ${d.status} ${a}`)}return{jobId:(await d.json()).id,estimatedSeconds:120}}async checkStatus(a){let b=await fetch(`${this.baseUrl}/generations/${a}`,{headers:{Authorization:`Bearer ${this.apiKey}`}});if(!b.ok)throw Error(`Luma status check failed: ${b.status}`);let c=await b.json();return"completed"===c.state&&c.assets?.video?{status:"complete",videoUrl:c.assets.video}:"failed"===c.state?{status:"failed",error:c.failure_reason??"Unknown error"}:{status:"processing"}}async downloadClip(a){let b=await fetch(a);if(!b.ok)throw Error(`Download failed: ${b.status}`);return Buffer.from(await b.arrayBuffer())}}let l={exterior_front:"runway",exterior_back:"runway",aerial:"runway",kitchen:"kling",living_room:"kling",master_bedroom:"kling",bedroom:"kling",bathroom:"kling",dining:"kling",pool:"luma",hallway:"kling",foyer:"kling",garage:"kling",other:"runway"},m=["runway","kling","luma"],n=new Map;function o(a){let b=n.get(a);if(!b){switch(a){case"runway":b=new h;break;case"kling":b=new j;break;case"luma":b=new k}n.set(a,b)}return b}async function p(a,b,c=18e4,d=3e3){let e=Date.now();for(;Date.now()-e<c;){let c=await a.checkStatus(b);if("complete"===c.status||"failed"===c.status)return c;await function(a){return new Promise(b=>setTimeout(b,a))}(d)}return{status:"failed",error:"Generation timed out"}}let q={runway:20,kling:10,luma:12},r={visionImageCost:1},s=["exterior_front","kitchen","living_room","master_bedroom","bathroom"];async function t(a){try{await (0,e.Rm)(a,"intake","info","Pipeline started");let b=await (0,e.Cw)(a);if(b.length<5){await (0,e.vu)(a,"failed"),await (0,e.Rm)(a,"intake","error",`Only ${b.length} photos. Need at least 5.`);return}await (0,e.Rm)(a,"intake","info",`${b.length} photos ready`),await u(a,b),await v(a),await w(a),await y(a),await (0,e.Rm)(a,"delivery","info","Pipeline complete!")}catch(c){let b=c instanceof Error?c.message:String(c);throw await (0,e.vu)(a,"failed"),await (0,e.Rm)(a,"intake","error",`Pipeline failed: ${b}`),c}}async function u(a,b){await (0,e.vu)(a,"analyzing"),await (0,e.Rm)(a,"analysis","info","Starting photo analysis");let c=new d.Ay,g=[];for(let d=0;d<b.length;d+=8){let i=b.slice(d,d+8),j=[];for(let b of i)try{let a=await fetch(b.file_url),c=Buffer.from(await a.arrayBuffer());j.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:c.toString("base64")}})}catch(c){await (0,e.Rm)(a,"analysis","warn",`Failed to load ${b.file_name}: ${c}`)}if(0!==j.length)try{var h;let a=await c.messages.create({model:"claude-sonnet-4-6-20250514",max_tokens:4096,system:f,messages:[{role:"user",content:[...j,{type:"text",text:(h=j.length,`Analyze the following ${h} property photos for AI video generation suitability. Return a JSON array of ${h} objects matching the schema:

[
  {
    "room_type": "kitchen",
    "quality_score": 7.5,
    "aesthetic_score": 8.0,
    "depth_rating": "high",
    "key_features": ["granite island", "pendant lighting"],
    "suggested_discard": false,
    "discard_reason": null
  }
]

Return ONLY the JSON array, no additional text.`)}]}]}),b=("text"===a.content[0].type?a.content[0].text:"").match(/\[[\s\S]*\]/);if(!b)continue;let d=JSON.parse(b[0]);for(let a=0;a<d.length&&a<i.length;a++)g.push({photo:i[a],analysis:d[a]})}catch(b){await (0,e.Rm)(a,"analysis","error",`LLM batch ${d} failed: ${b}`)}}let i=function(a){let b=a.filter(a=>!a.analysis.suggested_discard),c=new Map;for(let a of b){let b=c.get(a.analysis.room_type)??[];b.push(a),c.set(a.analysis.room_type,b)}for(let a of c.values())a.sort((a,b)=>b.analysis.aesthetic_score-a.analysis.aesthetic_score);let d=[];for(let a of s){let b=c.get(a);b?.[0]&&!d.some(b=>b.analysis.room_type===a)&&d.push(b[0])}for(let a of["exterior_back","aerial"]){let b=c.get(a);b?.[0]&&!d.some(b=>b.analysis.room_type===a)&&d.push(b[0])}for(let a of b.filter(a=>!d.includes(a)).sort((a,b)=>b.analysis.aesthetic_score-a.analysis.aesthetic_score)){if(d.length>=12)break;d.filter(b=>b.analysis.room_type===a.analysis.room_type).length>=2||d.push(a)}return d}(g);for(let{photo:a,analysis:b}of g){let c=i.some(b=>b.photo.id===a.id);await (0,e.u$)(a.id,{room_type:b.room_type,quality_score:b.quality_score,aesthetic_score:b.aesthetic_score,depth_rating:b.depth_rating,key_features:b.key_features,selected:c,discard_reason:b.suggested_discard?b.discard_reason:c?null:"Not selected"})}await (0,e.b9)().from("properties").update({selected_photo_count:i.length}).eq("id",a);let j=Math.round(b.length*r.visionImageCost+2);await (0,e.KU)(a,j),await (0,e.Rm)(a,"analysis","info",`Analysis done: ${i.length} selected from ${g.length}`)}async function v(a){await (0,e.vu)(a,"scripting"),await (0,e.Rm)(a,"scripting","info","Planning shots");let b=await (0,e.LW)(a);if(0===b.length){await (0,e.vu)(a,"failed"),await (0,e.Rm)(a,"scripting","error","No selected photos");return}let c=new d.Ay,f=b.map(a=>({id:a.id,file_name:a.file_name??"unknown.jpg",room_type:a.room_type??"other",aesthetic_score:a.aesthetic_score??5,depth_rating:a.depth_rating??"medium",key_features:a.key_features??[]})),h=await c.messages.create({model:"claude-sonnet-4-6-20250514",max_tokens:4096,system:g,messages:[{role:"user",content:function(a){let b=a.map(a=>`- ID: ${a.id} | File: ${a.file_name} | Room: ${a.room_type} | Aesthetic: ${a.aesthetic_score} | Depth: ${a.depth_rating} | Features: ${a.key_features.join(", ")}`).join("\n");return`Plan the shot list for this property. Here are the selected photos:

${b}

Return a JSON object:
{
  "mood": "modern_luxury",
  "music_tag": "upbeat_elegant",
  "scenes": [
    {
      "scene_number": 1,
      "photo_id": "uuid",
      "room_type": "exterior_front",
      "camera_movement": "orbital_slow",
      "prompt": "Cinematic slow orbital shot...",
      "duration_seconds": 4,
      "provider_preference": null
    }
  ]
}

mood options: modern_luxury, warm_cozy, bright_contemporary, classic_elegant, tropical_resort
music_tag options: upbeat_elegant, calm_ambient, modern_cinematic, warm_acoustic, dramatic_orchestral

Return ONLY the JSON object, no additional text.`}(f)}]}),i=("text"===h.content[0].type?h.content[0].text:"").match(/\{[\s\S]*\}/);if(!i){await (0,e.vu)(a,"failed"),await (0,e.Rm)(a,"scripting","error","Failed to parse director output");return}let j=JSON.parse(i[0]),k=new Set(b.map(a=>a.id)),l=j.scenes.filter(a=>k.has(a.photo_id));await (0,e.Ng)(l.map(b=>({property_id:a,photo_id:b.photo_id,scene_number:b.scene_number,camera_movement:b.camera_movement,prompt:b.prompt,duration_seconds:b.duration_seconds,provider:b.provider_preference??void 0}))),await (0,e.KU)(a,2),await (0,e.Rm)(a,"scripting","info",`Shot plan: ${l.length} scenes, mood: ${j.mood}`)}async function w(a){await (0,e.vu)(a,"generating");let b=await (0,e.WU)(a),c=parseInt(process.env.MAX_RETRIES_PER_CLIP??"2",10),d=(0,e.b9)();await (0,e.Rm)(a,"generation","info",`Generating ${b.length} clips in parallel`),await Promise.allSettled(b.map(async b=>{let f="";for(let i=0;i<=c;i++)try{var g,h;await (0,e.oM)(b.id,"generating",{attempt_count:i+1});let{data:c}=await d.from("photos").select("file_url, room_type").eq("id",b.photo_id).single();if(!c)throw Error("Source photo not found");let j=await fetch(c.file_url),k=Buffer.from(await j.arrayBuffer()),n=[],r=function(a,b,c=[]){let d=(function(){let a=[];return process.env.RUNWAY_API_KEY&&a.push("runway"),process.env.KLING_ACCESS_KEY&&process.env.KLING_SECRET_KEY&&a.push("kling"),process.env.LUMA_API_KEY&&a.push("luma"),a})().filter(a=>!c.includes(a));if(0===d.length)throw Error("No video generation providers available. Configure at least one API key.");if(b&&d.includes(b))return o(b);let e=l[a];if(d.includes(e))return o(e);for(let a of m)if(d.includes(a))return o(a);return o(d[0])}(c.room_type??"other",b.provider,n),s=Date.now(),t=await r.generateClip({sourceImage:k,prompt:b.prompt,durationSeconds:b.duration_seconds,aspectRatio:"16:9"});await (0,e.Rm)(a,"generation","info",`Scene ${b.scene_number}: submitted to ${r.name}`,void 0,b.id);let u=await p(r,t.jobId);if("failed"===u.status)throw Error(u.error??"Generation failed");let v=await r.downloadClip(u.videoUrl),w=`${a}/clips/scene_${b.scene_number}_v${i+1}.mp4`;await d.storage.from("property-videos").upload(w,v,{contentType:"video/mp4",upsert:!0});let{data:y}=d.storage.from("property-videos").getPublicUrl(w),z=u.costCents??(g=r.name,h=b.duration_seconds,Math.round(q[g]*h)),A=Date.now()-s;if(await (0,e.oM)(b.id,"qc_pass",{clip_url:y.publicUrl,provider:r.name,generation_cost_cents:z,generation_time_ms:A}),await (0,e.KU)(a,z),await (0,e.Rm)(a,"generation","info",`Scene ${b.scene_number}: done in ${(A/1e3).toFixed(1)}s via ${r.name}`,{costCents:z},b.id),await x(a,b.id,y.publicUrl,b))return;f="QC rejected"}catch(c){f=c instanceof Error?c.message:String(c),await (0,e.Rm)(a,"generation","warn",`Scene ${b.scene_number} attempt ${i+1} failed: ${f}`,void 0,b.id)}await (0,e.oM)(b.id,"needs_review"),await (0,e.Rm)(a,"generation","error",`Scene ${b.scene_number} failed after ${c+1} attempts: ${f}`,void 0,b.id)}));let f=await (0,e.WU)(a),g=f.filter(a=>"qc_pass"===a.status).length,h=f.filter(a=>"needs_review"===a.status).length;if(h>0&&g<6){await (0,e.vu)(a,"needs_review"),await (0,e.Rm)(a,"generation","warn",`${h} clips need review, only ${g} passed. Pausing for HITL.`);return}await (0,e.Rm)(a,"generation","info",`${g}/${f.length} clips ready`)}async function x(a,b,c,d){return"true"===process.env.QC_AUTO_APPROVE_ALL?await (0,e.oM)(b,"qc_pass",{qc_verdict:"auto_pass",qc_confidence:1}):(await (0,e.oM)(b,"qc_pass",{qc_verdict:"auto_pass",qc_confidence:1}),await (0,e.Rm)(a,"qc","info",`Scene ${d.scene_number} auto-passed (QC phase 2 pending)`)),!0}async function y(a){await (0,e.vu)(a,"assembling"),await (0,e.Rm)(a,"assembly","info","Starting assembly");let b=await (0,e.UU)(a),c=(await (0,e.WU)(a)).filter(a=>"qc_pass"===a.status&&a.clip_url);if(0===c.length){await (0,e.vu)(a,"failed"),await (0,e.Rm)(a,"assembly","error","No clips available for assembly");return}let d=Date.now()-new Date(b.created_at).getTime(),f=c[0]?.clip_url??null;await (0,e.vu)(a,"complete",{thumbnail_url:f,processing_time_ms:d}),await (0,e.Rm)(a,"assembly","info",`Complete! ${c.length} clips generated in ${(d/1e3).toFixed(1)}s. Total cost: $${(b.total_cost_cents/100).toFixed(2)}`,{clipCount:c.length,totalProcessingMs:d,totalCostCents:b.total_cost_cents})}},7143:(a,b,c)=>{"use strict";c.d(b,{Cw:()=>l,IL:()=>g,KU:()=>j,LW:()=>n,Ng:()=>o,Rm:()=>s,UU:()=>i,WU:()=>p,b9:()=>f,jD:()=>k,o5:()=>q,oM:()=>r,u$:()=>m,vu:()=>h});var d=c(2457);let e=null;function f(){if(!e){let a=process.env.SUPABASE_URL,b=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!a||!b)throw Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");e=(0,d.UU)(a,b)}return e}async function g(a){let{data:b,error:c}=await f().from("properties").insert(a).select().single();if(c)throw c;return b}async function h(a,b,c){let{error:d}=await f().from("properties").update({status:b,updated_at:new Date().toISOString(),...c}).eq("id",a);if(d)throw d}async function i(a){let{data:b,error:c}=await f().from("properties").select().eq("id",a).single();if(c)throw c;return b}async function j(a,b){let c=await i(a),{error:d}=await f().from("properties").update({total_cost_cents:c.total_cost_cents+b,updated_at:new Date().toISOString()}).eq("id",a);if(d)throw d}async function k(a){let{data:b,error:c}=await f().from("photos").insert(a).select();if(c)throw c;return b}async function l(a){let{data:b,error:c}=await f().from("photos").select().eq("property_id",a).order("created_at");if(c)throw c;return b}async function m(a,b){let{error:c}=await f().from("photos").update(b).eq("id",a);if(c)throw c}async function n(a){let{data:b,error:c}=await f().from("photos").select().eq("property_id",a).eq("selected",!0).order("aesthetic_score",{ascending:!1});if(c)throw c;return b}async function o(a){let{data:b,error:c}=await f().from("scenes").insert(a).select();if(c)throw c;return b}async function p(a){let{data:b,error:c}=await f().from("scenes").select().eq("property_id",a).order("scene_number");if(c)throw c;return b}async function q(a,b){let{error:c}=await f().from("scenes").update(b).eq("id",a);if(c)throw c}async function r(a,b,c){let{error:d}=await f().from("scenes").update({status:b,...c}).eq("id",a);if(d)throw d}async function s(a,b,c,d,e,g){let{error:h}=await f().from("pipeline_logs").insert({property_id:a,scene_id:g??null,stage:b,level:c,message:d,metadata:e??null});h&&console.error("Failed to write log:",h)}},8335:()=>{}};