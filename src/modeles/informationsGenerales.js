const { ErreurStatutDeploiementInvalide } = require('../erreurs');
const DonneesSensiblesSpecifiques = require('./donneesSensiblesSpecifiques');
const FonctionnalitesSpecifiques = require('./fonctionnalitesSpecifiques');
const InformationsHomologation = require('./informationsHomologation');
const PointsAcces = require('./pointsAcces');
const Referentiel = require('../referentiel');

class InformationsGenerales extends InformationsHomologation {
  constructor(donnees = {}, referentiel = Referentiel.creeReferentielVide()) {
    super({
      proprietesAtomiquesRequises: [
        'delaiAvantImpactCritique',
        'nomService',
        'presenceResponsable',
        'presentation',
        'statutDeploiement',
      ],
      proprietesAtomiquesFacultatives: [
        'localisationDonnees',
      ],
      proprietesListes: [
        'donneesCaracterePersonnel',
        'fonctionnalites',
        'typeService',
        'provenanceService',
      ],
      listesAgregats: {
        donneesSensiblesSpecifiques: DonneesSensiblesSpecifiques,
        fonctionnalitesSpecifiques: FonctionnalitesSpecifiques,
        pointsAcces: PointsAcces,
      },
    });
    InformationsGenerales.valide(donnees, referentiel);
    this.renseigneProprietes(donnees);

    this.referentiel = referentiel;
  }

  descriptionTypeService() {
    return this.referentiel.typeService(this.typeService);
  }

  nombreDonneesSensiblesSpecifiques() {
    return this.donneesSensiblesSpecifiques.nombre();
  }

  nombreFonctionnalitesSpecifiques() {
    return this.fonctionnalitesSpecifiques.nombre();
  }

  nombrePointsAcces() {
    return this.pointsAcces.nombre();
  }

  seuilCriticite() {
    return this.referentiel.criticite(
      this.fonctionnalites, this.donneesCaracterePersonnel, this.delaiAvantImpactCritique
    );
  }

  static valide(donnees, referentiel) {
    const { statutDeploiement } = donnees;

    if (statutDeploiement && !referentiel.statutDeploiementValide(statutDeploiement)) {
      throw new ErreurStatutDeploiementInvalide(
        `Le statut de déploiement "${statutDeploiement}" est invalide`
      );
    }
  }
}

module.exports = InformationsGenerales;
