import parametres from '../modules/parametres.js';
import brancheInputsIdentite from '../modules/brancheInputsIdentite.js';

$(() => {
  const idsInputsIdentite = [
    { idJeSuis: '#je-suis-pilote-projet', idZoneSaisie: '#pilote-projet' },
    { idJeSuis: '#je-suis-expert-cybersecurite', idZoneSaisie: '#expert-cybersecurite' },
  ];

  brancheInputsIdentite(idsInputsIdentite);

  const $bouton = $('.bouton');
  const identifiantHomologation = $bouton.attr('identifiant');

  $bouton.click(() => {
    idsInputsIdentite
      .map((ids) => ids.idZoneSaisie)
      .forEach((selecteur) => $(selecteur).removeAttr('disabled'));

    const params = parametres('form#parties-prenantes');

    axios.post(`/api/homologation/${identifiantHomologation}/partiesPrenantes`, params)
      .then((reponse) => (window.location = `/homologation/${reponse.data.idHomologation}`));
  });
});
