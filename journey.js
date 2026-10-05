export const END=112;
export const CHECKPOINTS=[{id:0,z:0,round:0,name:'Início da peregrinação'},{id:1,z:35,round:3,name:'Abrigo do Sino'},{id:2,z:71,round:6,name:'Abrigo das Brasas'}];
export const ENCOUNTERS=[
{id:'duel-0',z:10,hp:72,windup:1.05,damage:19,label:'Peregrino das Cinzas',pattern:'corte',variant:'pilgrim',act:0},
{id:'duel-1',z:20,hp:86,windup:.92,damage:20,label:'Vigia da Praça',pattern:'corte',variant:'sentinel',act:0},
{id:'duel-2',z:30,hp:100,windup:1.15,damage:23,label:'Portador do Sino',pattern:'pesado',variant:'bell',act:0},
{id:'duel-3',z:46,hp:100,windup:1.05,damage:22,label:'Sentinela do Eco',pattern:'investida',variant:'sentinel',act:1},
{id:'duel-4',z:56,hp:116,windup:1.28,damage:25,label:'Peregrino da Abadia',pattern:'pesado',variant:'bell',act:1},
{id:'duel-5',z:66,hp:126,windup:.83,damage:24,label:'Lâmina do Claustro',pattern:'investida',variant:'sentinel',act:1},
{id:'duel-6',z:82,hp:132,windup:.85,damage:25,label:'Vigia do Horizonte',pattern:'corte',variant:'pilgrim',act:2},
{id:'duel-7',z:94,hp:150,windup:1.18,damage:27,label:'Arauto da Brasa',pattern:'pesado',variant:'bell',act:2},
{id:'duel-8',z:105,hp:230,windup:1.3,damage:30,label:'Guardião do Halo Partido',pattern:'pesado',variant:'boss',act:2,boss:true}];
export function actAt(z){return z<39?0:z<75?1:2;}
