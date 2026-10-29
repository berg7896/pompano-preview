"""Build <page>/embed.js from <page>/index.html for a Duda HTML widget.

The widget's <script> is moved into <head> by Duda, so the script mounts the page itself:
on the live domain it takes over the whole page (hides Duda's #dm); in the Duda editor it
mounts inside #dm_content so the page stays editable. CSS lives in a Shadow DOM so Duda's
styles can't leak in.   Usage: python3 tools_build_embed.py wisdom-teeth 'oralsurgeryoflighthousepoint\\.com'
"""
import json, re, sys
page, live = sys.argv[1], sys.argv[2]
h = open(f'{page}/index.html').read()
fonts = re.search(r'<link href="(https://fonts\.googleapis\.com/[^"]+)" rel="stylesheet">', h).group(1)
css = h[h.index('<style>') + 7:h.index('</style>')]
css = css.replace(':root{', ':host{').replace('\nhtml{scroll-behavior:smooth}', '')
css = re.sub(r'\nbody\{', '\n.page{', css)
body = h[h.index('<body>') + 6:h.index('<script>')]
js = h[h.index('<script>') + 8:h.rindex('</script>')]
js = js.replace('document.querySelector', 'sh.querySelector').replace('var R = document', 'var R = sh')
out = f"""(function(){{
var LIVE=/(^|\\.){live}$/.test(location.hostname);
function go(){{
if(window.__icemDone)return;window.__icemDone=true;
var root=document.getElementById('icem');
if(!root){{root=document.createElement('div');root.id='icem';if(LIVE){{document.body.insertBefore(root,document.body.firstChild);}}else{{var host=document.getElementById('dm_content')||document.querySelector('.dmContent')||document.body;host.insertBefore(root,host.firstChild);}}}}
var l=document.createElement('link');l.rel='stylesheet';l.href={json.dumps(fonts)};document.head.appendChild(l);
var hs=document.createElement('style');hs.textContent=(LIVE?"#dm{{display:none!important}}":"")+"html,body{{margin:0!important;padding:0!important;overflow-x:hidden!important;background:#FFFFFF!important}}#icem{{display:block;width:100%}}";document.head.appendChild(hs);
var sh=root.attachShadow?root.attachShadow({{mode:'open'}}):root;
sh.innerHTML='<style>'+{json.dumps(css)}+'</style><div class="page">'+{json.dumps(body)}+'</div>';
// in-page links (#callback) must scroll inside the isolated page
sh.querySelectorAll('a[href^="#"]').forEach(function(a){{a.addEventListener('click',function(e){{var t=sh.querySelector(a.getAttribute('href'));if(t){{e.preventDefault();t.scrollIntoView({{behavior:'smooth',block:'start'}});}}}});}});
{js}
}}
if(document.readyState==='loading'){{document.addEventListener('DOMContentLoaded',go);}}else{{go();}}
}})();
"""
open(f'{page}/embed.js', 'w').write(out)
print('built', page, len(out))
