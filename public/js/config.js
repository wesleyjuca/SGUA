// SGUA — Constantes globais e paleta de cores
var h = React.createElement;

var C = {
  g0:'#0A3D2B', g1:'#0F5C3A', g2:'#1A7A4A', g3:'#2E9E63',
  gl:'#C8E6D4', gx:'#EAF7EE',
  b1:'#1565A8', bl:'#DCF0FF',
  t1:'#7B4D1A', tl:'#FAEBD7', am:'#C4832A', al:'#FFF3E0',
  rm:'#A32D2D', rl:'#FCEBEB',
  pm:'#5B3FA8', px:'#EDE9FB',
  cl:'#DEE2D8', cx:'#F7F8F5', cm:'#6B7260', cd:'#1E2218'
};

// Perfis de permissões
var PD = {
  admin:  { units:true, news:true, users:true, sols:true, feeds:true, cfg:true, rel:true },
  gestor: { units:true, news:true, users:false, sols:true, feeds:false, cfg:false, rel:true },
  viewer: { units:false, news:false, users:false, sols:false, feeds:false, cfg:false, rel:false }
};

// Versão do schema de cache
var SK = 'sagcu_v5_';
var PAGE_SIZE = 20; // itens por página em listas admin
