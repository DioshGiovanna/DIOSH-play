// Original short story proposal. Gameplay events place these beats at rests.
export const STORY = {
  intro: 'O último sino se calou, e o eclipse fechou a estrada. Você carrega a brasa que ainda resta. Reacenda os abrigos. Chegue ao sino antes que a luz se apague.',
  acts: [
    { title: 'I · PEDRA E CINZAS', line: 'As portas estão abertas. Ninguém voltou para fechá-las.' },
    { title: 'II · A ABADIA VAZIA', line: 'O eco responde. Há alguém esperando do outro lado.' },
    { title: 'III · SOB O ECLIPSE', line: 'A brasa ilumina a ponte. O último sino está perto.' }
  ],
  camps: {
    1: { title: 'ABRIGO DO SINO', line: 'Sua brasa acorda a chama. O primeiro abrigo volta a receber viajantes. Entre os restos da forja, escolha o que levar adiante.' },
    2: { title: 'ABRIGO DAS BRASAS', line: 'A segunda chama alcança a ponte. A sombra que guarda o sino já percebeu sua chegada. Prepare sua arma: resta a travessia.' }
  },
  ending: 'O sino volta a soar. Pequenas luzes respondem dos abrigos atrás de você. O eclipse ainda cobre o céu, mas a estrada já não está sozinha.',
  retry: 'A brasa permanece acesa no último abrigo. Levante-se. O caminho ainda espera por você.'
};
