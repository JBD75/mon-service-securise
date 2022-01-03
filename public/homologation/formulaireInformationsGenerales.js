import ElementsAjoutables from '../modules/elementsAjoutables.js';

const sourceRegExpParamsItem = (nomIndicatif) => `^(description)-${nomIndicatif}-`;

const listesAvecItemsExtraits = [
  { cle: 'pointsAcces', nomIndicatif: 'point-acces' },
  { cle: 'fonctionnalitesSpecifiques', nomIndicatif: 'fonctionnalite' },
  { cle: 'donneesSensiblesSpecifiques', nomIndicatif: 'donnees-sensibles' },
].map((valeur) => (
  { ...valeur, sourceRegExpParamsItem: sourceRegExpParamsItem(valeur.nomIndicatif) }
));

$(() => {
  ElementsAjoutables.nouveaux(
    { nom: 'donnees-sensibles' },
    '#donnees-sensibles-specifiques',
    '#donnees-donnees-sensibles-specifiques',
    '#nouvelles-donnees-sensibles'
  );

  ElementsAjoutables.nouveaux(
    { nom: 'fonctionnalite' },
    '#fonctionnalites-specifiques',
    '#donnees-fonctionnalites-specifiques',
    '#nouvelle-fonctionnalite'
  );

  ElementsAjoutables.nouveaux(
    { nom: 'point-acces', valeurExemple: 'exemple : https://www.adresse.fr, App Store, Play Store…' },
    '#points-acces',
    '#donnees-points-acces',
    '#nouveau-point-acces'
  );
});

export default listesAvecItemsExtraits;
