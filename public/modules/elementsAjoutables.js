import { brancheAjoutItem } from './saisieListeItems.js';

const brancheElementsAjoutables = (identifiantConteneurElements, identifiantElement, valeurExemple = '') => {
  const indexMax = (selecteurDuConteneur) => {
    let index = $(selecteurDuConteneur).children().length;
    while ($(`#description-${identifiantElement}-${index}`).length > 0) {
      index += 1;
    }
    return index;
  };

  const selecteurConteneur = `#${identifiantConteneurElements}`;
  const selecteurLienAjout = `#ajout-element-${identifiantElement}`;

  const templateZoneSaisie = (nomElement, valeurExempleElement) => (index, { description = '' }) => `
    <input
      id="description-${nomElement}-${index}"
      name="description-${nomElement}-${index}"
      type="text"
      value="${description}"
      placeholder="${valeurExempleElement}"
    >
  `;

  brancheAjoutItem(
    selecteurLienAjout,
    selecteurConteneur,
    (index) => templateZoneSaisie(identifiantElement, valeurExemple)(index, {}),
    () => indexMax(selecteurConteneur)
  );
};

export default brancheElementsAjoutables;
