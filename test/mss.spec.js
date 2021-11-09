const axios = require('axios');
const expect = require('expect.js');

const { ErreurEmailManquant, ErreurUtilisateurExistant } = require('../src/erreurs');
const MSS = require('../src/mss');
const Referentiel = require('../src/referentiel');
const DepotDonnees = require('../src/depotDonnees');
const Homologation = require('../src/modeles/homologation');

const verifieRequeteGenereErreurHTTP = (status, messageErreur, requete, suite) => {
  axios(requete)
    .then(() => suite('Réponse OK inattendue'))
    .catch((erreur) => {
      expect(erreur.response.status).to.equal(status);
      expect(erreur.response.data).to.equal(messageErreur);
      suite();
    })
    .catch(suite);
};

const verifieRequeteChangeEtat = (donneesEtat, requete, done) => {
  const { lectureEtat, etatInitial = false, etatFinal = true } = donneesEtat;
  expect(lectureEtat()).to.eql(etatInitial);

  axios(requete)
    .then(() => {
      expect(lectureEtat()).to.eql(etatFinal);
      done();
    })
    .catch((erreur) => {
      const erreurHTTP = erreur.response && erreur.response.status;
      if (erreurHTTP >= 400 && erreurHTTP < 500) {
        expect(lectureEtat()).to.eql(etatFinal);
        done();
      } else throw erreur;
    })
    .catch(done);
};

describe('Le serveur MSS', () => {
  let idUtilisateurCourant;
  let suppressionCookieEffectuee;
  let verificationJWTMenee;
  let verificationCGUMenee;
  let authentificationBasiqueMenee;
  let rechercheHomologationEffectuee;
  let parametresAseptises;

  const verifieRequeteExigeSuppressionCookie = (...params) => {
    verifieRequeteChangeEtat({ lectureEtat: () => suppressionCookieEffectuee }, ...params);
  };

  const verifieRequeteExigeJWT = (...params) => {
    verifieRequeteChangeEtat({ lectureEtat: () => verificationJWTMenee }, ...params);
  };

  const verifieRequeteExigeAcceptationCGU = (...params) => {
    verifieRequeteChangeEtat({ lectureEtat: () => verificationCGUMenee }, ...params);
  };

  const verifieRequeteExigeAuthentificationBasique = (...params) => {
    verifieRequeteChangeEtat({ lectureEtat: () => authentificationBasiqueMenee }, ...params);
  };

  const verifieRechercheHomologation = (...params) => {
    verifieRequeteChangeEtat({ lectureEtat: () => rechercheHomologationEffectuee }, ...params);
  };

  const verifieAseptisationParametres = (nomsParametres, ...params) => {
    verifieRequeteChangeEtat({
      lectureEtat: () => parametresAseptises,
      etatInitial: [],
      etatFinal: nomsParametres,
    }, ...params);
  };

  const verifieValeurHeader = (valeurHeader, regExpValeurAttendue, suite) => {
    expect(valeurHeader).to.match(regExpValeurAttendue);
    suite();
  };

  const verifieJetonDepose = (reponse, suite) => verifieValeurHeader(
    reponse.headers['set-cookie'][0],
    /^token=.+; path=\/; expires=.+; samesite=strict; httponly$/,
    suite
  );

  const verifiePositionnementHeader = (requete, nomHeader, regExpAttendue, suite) => axios(requete)
    .then((reponse) => {
      expect(reponse.headers).to.have.property(nomHeader);
      verifieValeurHeader(reponse.headers[nomHeader], regExpAttendue, suite);
    })
    .catch(suite);

  const middleware = {
    suppressionCookie: (requete, reponse, suite) => {
      suppressionCookieEffectuee = true;
      suite();
    },

    verificationJWT: (requete, reponse, suite) => {
      requete.idUtilisateurCourant = idUtilisateurCourant;
      verificationJWTMenee = true;
      suite();
    },

    verificationAcceptationCGU: (requete, reponse, suite) => {
      requete.idUtilisateurCourant = idUtilisateurCourant;
      verificationCGUMenee = true;
      suite();
    },

    authentificationBasique: (requete, reponse, suite) => {
      authentificationBasiqueMenee = true;
      suite();
    },

    trouveHomologation: (requete, reponse, suite) => {
      requete.homologation = new Homologation({ id: '456' });
      rechercheHomologationEffectuee = true;
      suite();
    },

    aseptise: (...nomsParametres) => (requete, reponse, suite) => {
      parametresAseptises = nomsParametres;
      suite();
    },
  };

  let adaptateurMail;
  let depotDonnees;
  let referentiel;
  let serveur;

  beforeEach((done) => {
    idUtilisateurCourant = undefined;
    suppressionCookieEffectuee = false;
    verificationJWTMenee = false;
    verificationCGUMenee = false;
    authentificationBasiqueMenee = false;
    rechercheHomologationEffectuee = false;
    parametresAseptises = [];

    referentiel = Referentiel.creeReferentielVide();
    adaptateurMail = {
      envoieMessageFinalisationInscription: () => Promise.resolve(),
      envoieMessageReinitialisationMotDePasse: () => Promise.resolve(),
    };
    DepotDonnees.creeDepotVide()
      .then((depot) => {
        depotDonnees = depot;
        serveur = MSS.creeServeur(depotDonnees, middleware, referentiel, adaptateurMail, false);
        serveur.ecoute(1234, done);
      });
  });

  afterEach(() => { serveur.arreteEcoute(); });

  it('sert des pages HTML', (done) => {
    axios.get('http://localhost:1234/')
      .then((reponse) => {
        expect(reponse.status).to.equal(200);
        done();
      })
      .catch(done);
  });

  describe('quand une page est servie', () => {
    it('autorise le chargement de toutes les ressources du domaine', (done) => {
      verifiePositionnementHeader(
        'http://localhost:1234/',
        'content-security-policy', /default-src 'self'/,
        done,
      );
    });

    it('autorise le chargement de tous les scripts extérieurs utilisés dans la vue', (done) => {
      verifiePositionnementHeader(
        'http://localhost:1234/',
        'content-security-policy', /script-src[^;]* unpkg.com code.jquery.com/,
        done,
      );
    });

    it('autorise le chargemnet de tous les scripts du domaine', (done) => {
      verifiePositionnementHeader(
        'http://localhost:1234/',
        'content-security-policy', /script-src[^;]* 'self'/,
        done,
      );
    });

    it('interdit le chargement de cette page dans une iFrame', (done) => {
      verifiePositionnementHeader(
        'http://localhost:1234/',
        'x-frame-options', /^deny$/,
        done
      );
    });

    it('interdit les inférences de types de média hors des infos données par le serveur', (done) => {
      verifiePositionnementHeader(
        'http://localhost:1234/',
        'x-content-type-options', /^nosniff$/,
        done
      );
    });

    it("n'affiche pas l'URL de provenance quand l'utilisateur change de page", (done) => {
      verifiePositionnementHeader(
        'http://localhost:1234/',
        'referrer-policy', /^no-referrer$/,
        done
      );
    });

    it("n'affiche pas d'information sur la nature du serveur", (done) => {
      axios.get('http://localhost:1234')
        .then((reponse) => {
          expect(reponse.headers).to.not.have.property('x-powered-by');
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête GET sur `/connexion`', () => {
    it("déconnecte l'utilisateur courant", (done) => {
      verifieRequeteExigeSuppressionCookie('http://localhost:1234/connexion', done);
    });
  });

  describe('quand requête GET sur `/reinitialisationMotDePasse`', () => {
    it("déconnecte l'utilisateur courant", (done) => {
      verifieRequeteExigeSuppressionCookie(
        'http://localhost:1234/reinitialisationMotDePasse', done
      );
    });
  });

  describe('quand requête GET sur `/initialisationMotDePasse/:idReset`', () => {
    describe('avec idReset valide', () => {
      const utilisateur = { id: '123', genereToken: () => 'un token', accepteCGU: () => false };

      beforeEach(() => {
        depotDonnees.utilisateurAFinaliser = () => Promise.resolve(utilisateur);
        depotDonnees.utilisateur = () => Promise.resolve(utilisateur);
      });

      it('dépose le jeton dans un cookie', (done) => {
        depotDonnees.utilisateurAFinaliser = (idReset) => new Promise((resolve) => {
          expect(idReset).to.equal('999');
          resolve(utilisateur);
        });

        axios.get('http://localhost:1234/initialisationMotDePasse/999')
          .then((reponse) => verifieJetonDepose(reponse, done))
          .catch(done);
      });
    });

    it("aseptise l'identifiant reçu", (done) => {
      verifieAseptisationParametres(
        ['idReset'], 'http://localhost:1234/initialisationMotDePasse/999', done
      );
    });

    it('retourne une erreur HTTP 404 si idReset inconnu', (done) => {
      depotDonnees.utilisateurAFinaliser = () => Promise.resolve(undefined);

      verifieRequeteGenereErreurHTTP(
        404, "Identifiant d'initialisation de mot de passe \"999\" inconnu",
        'http://localhost:1234/initialisationMotDePasse/999', done
      );
    });
  });

  describe('quand requête GET sur `/admin/inscription`', () => {
    it("verrouille l'accès par une authentification basique", (done) => {
      verifieRequeteExigeAuthentificationBasique('http://localhost:1234/admin/inscription', done);
    });
  });

  describe('quand requête GET sur `/api/homologations`', () => {
    it("vérifie que l'utilisateur est authentifié", (done) => {
      verifieRequeteExigeAcceptationCGU('http://localhost:1234/api/homologations', done);
    });

    it("interroge le dépôt de données pour récupérer les homologations de l'utilisateur", (done) => {
      idUtilisateurCourant = '123';

      const homologation = { toJSON: () => ({ id: '456' }) };
      depotDonnees.homologations = (idUtilisateur) => {
        expect(idUtilisateur).to.equal('123');
        return Promise.resolve([homologation]);
      };

      axios.get('http://localhost:1234/api/homologations')
        .then((reponse) => {
          expect(reponse.status).to.equal(200);

          const { homologations } = reponse.data;
          expect(homologations.length).to.equal(1);
          expect(homologations[0].id).to.equal('456');
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête GET sur `/homologations`', () => {
    it("vérifie que l'utilisateur est authentifié", (done) => {
      verifieRequeteExigeAcceptationCGU('http://localhost:1234/homologations', done);
    });
  });

  describe('quand requête GET sur `/homologation/:id`', () => {
    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation('http://localhost:1234/homologation/456', done);
    });
  });

  describe('quand requête GET sur `/homologation/:id/edition`', () => {
    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation('http://localhost:1234/homologation/456/edition', done);
    });
  });

  describe('quand requête GET sur `/homologation/:id/caracteristiquesComplementaires`', () => {
    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation('http://localhost:1234/homologation/456/caracteristiquesComplementaires', done);
    });
  });

  describe('quand requête GET sur `/homologation/:id/decision`', () => {
    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation('http://localhost:1234/homologation/456/decision', done);
    });
  });

  describe('quand requête GET sur `/homologation/:id/mesures`', () => {
    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation('http://localhost:1234/homologation/456/mesures', done);
    });
  });

  describe('quand requete GET sur `/homologation/:id/partiesPrenantes`', () => {
    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation('http://localhost:1234/homologation/456/partiesPrenantes', done);
    });
  });

  describe('quand requête GET sur `/homologation/:id/risques`', () => {
    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation('http://localhost:1234/homologation/456/risques', done);
    });
  });

  describe('quand requête GET sur `/homologation/:id/avisExpertCyber`', () => {
    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation('http://localhost:1234/homologation/456/avisExpertCyber', done);
    });
  });

  describe('quand requête GET sur `/api/seuilCriticite`', () => {
    it('vérifie que les CGU sont acceptées', (done) => {
      verifieRequeteExigeAcceptationCGU('http://localhost:1234/api/seuilCriticite', done);
    });

    it('détermine le seuil de criticité pour le service', (done) => {
      referentiel.criticite = (idsFonctionnalites, idsDonnees, idDelai) => {
        expect(idsFonctionnalites).to.eql(['f1', 'f2']);
        expect(idsDonnees).to.eql(['d1', 'd2']);
        expect(idDelai).to.equal('unDelai');
        return 'moyen';
      };

      axios('http://localhost:1234/api/seuilCriticite', { params: {
        fonctionnalites: ['f1', 'f2'],
        donneesCaracterePersonnel: ['d1', 'd2'],
        delaiAvantImpactCritique: 'unDelai',
      } })
        .then((reponse) => expect(reponse.data).to.eql({ seuilCriticite: 'moyen' }))
        .then(() => done())
        .catch(done);
    });

    it('retourne une erreur HTTP 422 si les données sont invalides', (done) => {
      axios.get('http://localhost:1234/api/seuilCriticite', { params: {
        delaiAvantImpactCritique: 'delaiInvalide',
      } })
        .then(() => done('Réponse HTTP OK inattendue'))
        .catch((erreur) => {
          expect(erreur.response.status).to.equal(422);
          expect(erreur.response.data).to.equal('Données invalides');
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête POST sur `/api/homologation`', () => {
    it("vérifie que l'utilisateur est authentifié", (done) => {
      verifieRequeteExigeAcceptationCGU(
        { method: 'post', url: 'http://localhost:1234/api/homologation' }, done
      );
    });

    it('aseptise les paramètres', (done) => {
      verifieAseptisationParametres(
        ['nomService'],
        { method: 'post', url: 'http://localhost:1234/api/homologation' },
        done
      );
    });

    it('retourne une erreur HTTP 422 si données insuffisantes pour création homologation', (done) => {
      axios.post('http://localhost:1234/api/homologation', {})
        .then(() => done('Réponse HTTP OK inattendue'))
        .catch((erreur) => {
          expect(erreur.response.status).to.equal(422);
          expect(erreur.response.data).to.equal("Données insuffisantes pour créer l'homologation");
          done();
        })
        .catch(done);
    });

    it("demande au dépôt de données d'enregistrer les nouvelles homologations", (done) => {
      idUtilisateurCourant = '123';

      depotDonnees.nouvelleHomologation = (idUtilisateur, donneesHomologation) => {
        expect(idUtilisateur).to.equal('123');
        expect(donneesHomologation).to.eql({
          nomService: 'Super Service',
          natureService: undefined,
          provenanceService: undefined,
          dejaMisEnLigne: undefined,
          fonctionnalites: undefined,
          donneesCaracterePersonnel: undefined,
          delaiAvantImpactCritique: undefined,
          presenceResponsable: undefined,
        });
        return Promise.resolve('456');
      };

      axios.post('http://localhost:1234/api/homologation', { nomService: 'Super Service' })
        .then((reponse) => {
          expect(reponse.status).to.equal(200);
          expect(reponse.data).to.eql({ idHomologation: '456' });
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête PUT sur `/api/homologation/:id`', () => {
    beforeEach(() => (
      depotDonnees.ajouteInformationsGeneralesAHomologation = () => Promise.resolve()
    ));

    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation(
        { method: 'put', url: 'http://localhost:1234/api/homologation/456' }, done
      );
    });

    it('aseptise les paramètres', (done) => {
      verifieAseptisationParametres(
        ['nomService'],
        { method: 'put', url: 'http://localhost:1234/api/homologation/456' },
        done
      );
    });

    it("demande au dépôt de données de mettre à jour l'homologation", (done) => {
      idUtilisateurCourant = '123';

      depotDonnees.ajouteInformationsGeneralesAHomologation = (
        (identifiant, infosGenerales) => new Promise((resolve) => {
          expect(identifiant).to.equal('456');
          expect(infosGenerales.nomService).to.equal('Nouveau Nom');
          resolve();
        })
      );

      axios.put('http://localhost:1234/api/homologation/456', { nomService: 'Nouveau Nom' })
        .then((reponse) => {
          expect(reponse.status).to.equal(200);
          expect(reponse.data).to.eql({ idHomologation: '456' });
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête POST sur `/api/homologation/:id/caracteristiquesComplementaires', () => {
    beforeEach(() => (
      depotDonnees.ajouteCaracteristiquesAHomologation = () => new Promise((resolve) => resolve())
    ));

    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation({
        method: 'post',
        url: 'http://localhost:1234/api/homologation/456/caracteristiquesComplementaires',
      }, done);
    });

    it('aseptise les paramètres entités externes', (done) => {
      verifieAseptisationParametres(
        ['entitesExternes.*.nom', 'entitesExternes.*.contact', 'entitesExternes.*.acces'],
        {
          method: 'post',
          url: 'http://localhost:1234/api/homologation/456/caracteristiquesComplementaires',
        },
        done
      );
    });

    it("demande au dépôt d'associer les caractéristiques à l'homologation", (done) => {
      let caracteristiquesAjoutees = false;

      depotDonnees.ajouteCaracteristiquesAHomologation = (
        (idHomologation, caracteristiques) => new Promise((resolve) => {
          expect(idHomologation).to.equal('456');
          expect(caracteristiques.presentation).to.equal('Une présentation');
          caracteristiquesAjoutees = true;
          resolve();
        })
      );

      axios.post('http://localhost:1234/api/homologation/456/caracteristiquesComplementaires', {
        presentation: 'Une présentation',
      })
        .then((reponse) => {
          expect(caracteristiquesAjoutees).to.be(true);
          expect(reponse.status).to.equal(200);
          expect(reponse.data).to.eql({ idHomologation: '456' });
          done();
        })
        .catch(done);
    });

    it('filtre les entités externes vides', (done) => {
      depotDonnees.ajouteCaracteristiquesAHomologation = (_, caracteristiques) => (
        new Promise((resolve) => {
          expect(caracteristiques.entitesExternes.nombre()).to.equal(1);
          resolve();
        })
      );

      const entitesExternes = [];
      entitesExternes[2] = { nom: 'Une entité', acces: 'Accès administrateur' };

      axios.post(
        'http://localhost:1234/api/homologation/456/caracteristiquesComplementaires',
        { entitesExternes },
      )
        .then(() => done())
        .catch(done);
    });

    it('retourne une erreur HTTP 422 si les données sont invalides', (done) => {
      axios.post('http://localhost:1234/api/homologation/456/caracteristiquesComplementaires', {
        localisationDonnees: 'localisationInvalide',
      })
        .then(() => done('Réponse HTTP OK inattendue'))
        .catch((erreur) => {
          expect(erreur.response.status).to.equal(422);
          expect(erreur.response.data).to.equal('Données invalides');
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête POST sur `/api/homologation/:id/mesures', () => {
    beforeEach(() => (
      depotDonnees.remplaceMesuresSpecifiquesPourHomologation = () => Promise.resolve()
    ));

    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation({
        method: 'post',
        url: 'http://localhost:1234/api/homologation/456/mesures',
      }, done);
    });

    it('aseptise tous les paramètres de la requête', (done) => {
      verifieAseptisationParametres(
        [
          '*',
          'mesuresSpecifiques.*.description',
          'mesuresSpecifiques.*.categorie',
          'mesuresSpecifiques.*.statut',
          'mesuresSpecifiques.*.modalites',
        ],
        { method: 'post', url: 'http://localhost:1234/api/homologation/456/mesures' },
        done
      );
    });

    it("demande au dépôt d'associer les mesures générales à l'homologation", (done) => {
      referentiel.recharge({ mesures: { identifiantMesure: {} } });
      let mesureAjoutee = false;

      depotDonnees.ajouteMesureGeneraleAHomologation = (idHomologation, mesure) => {
        expect(idHomologation).to.equal('456');
        expect(mesure.id).to.equal('identifiantMesure');
        expect(mesure.statut).to.equal('fait');
        expect(mesure.modalites).to.equal("Des modalités d'application");
        mesureAjoutee = true;
        return Promise.resolve();
      };

      axios.post('http://localhost:1234/api/homologation/456/mesures', {
        identifiantMesure: 'fait',
        'modalites-identifiantMesure': "Des modalités d'application",
      })
        .then((reponse) => {
          expect(mesureAjoutee).to.be(true);
          expect(reponse.status).to.equal(200);
          expect(reponse.data).to.eql({ idHomologation: '456' });
          done();
        })
        .catch(done);
    });

    it("demande au dépôt d'associer les mesures spécifiques à l'homologation", (done) => {
      let mesuresRemplacees = false;
      depotDonnees.remplaceMesuresSpecifiquesPourHomologation = (idHomologation, mesures) => {
        expect(idHomologation).to.equal('456');
        expect(mesures.nombre()).to.equal(1);
        expect(mesures.item(0).description).to.equal('Une mesure spécifique');
        mesuresRemplacees = true;
        return Promise.resolve();
      };

      referentiel.recharge({ categoriesMesures: { uneCategorie: 'Une catégorie' } });
      axios.post('http://localhost:1234/api/homologation/456/mesures', {
        mesuresSpecifiques: [{ description: 'Une mesure spécifique', categorie: 'uneCategorie' }],
      })
        .then(() => expect(mesuresRemplacees).to.be(true))
        .then(() => done())
        .catch(done);
    });

    it('filtre les mesures spécifiques vides', (done) => {
      let mesuresRemplacees = false;
      depotDonnees.remplaceMesuresSpecifiquesPourHomologation = (_, mesures) => {
        expect(mesures.nombre()).to.equal(1);
        mesuresRemplacees = true;
        return Promise.resolve();
      };

      const mesuresSpecifiques = [];
      mesuresSpecifiques[2] = { description: 'Une mesure spécifique' };

      axios.post('http://localhost:1234/api/homologation/456/mesures', { mesuresSpecifiques })
        .then(() => expect(mesuresRemplacees).to.be(true))
        .then(() => done())
        .catch(done);
    });

    it('retourne une erreur HTTP 422 si les données sont invalides', (done) => {
      axios.post('http://localhost:1234/api/homologation/456/mesures', {
        identifiantInvalide: 'statutInvalide',
      })
        .then(() => done('Réponse HTTP OK inattendue'))
        .catch((erreur) => {
          expect(erreur.response.status).to.equal(422);
          expect(erreur.response.data).to.equal('Données invalides');
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête POST sur `/api/homologation/:id/partiesPrenantes`', () => {
    beforeEach(() => (
      depotDonnees.ajoutePartiesPrenantesAHomologation = () => new Promise((resolve) => resolve())
    ));

    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation({
        method: 'post',
        url: 'http://localhost:1234/api/homologation/456/partiesPrenantes',
      }, done);
    });

    it("demande au dépôt d'associer les parties prenantes à l'homologation", (done) => {
      let partiesPrenantesAjoutees = false;

      depotDonnees.ajoutePartiesPrenantesAHomologation = (idHomologation, pp) => new Promise(
        (resolve) => {
          expect(idHomologation).to.equal('456');
          expect(pp.autoriteHomologation).to.equal('Jean Dupont');
          partiesPrenantesAjoutees = true;
          resolve();
        }
      );

      axios.post('http://localhost:1234/api/homologation/456/partiesPrenantes', {
        autoriteHomologation: 'Jean Dupont',
      })
        .then((reponse) => {
          expect(partiesPrenantesAjoutees).to.be(true);
          expect(reponse.status).to.equal(200);
          expect(reponse.data).to.eql({ idHomologation: '456' });
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête POST sur `/api/homologation/:id/risques`', () => {
    beforeEach(() => {
      depotDonnees.marqueRisquesCommeVerifies = () => Promise.resolve();
      depotDonnees.remplaceRisquesSpecifiquesPourHomologation = () => Promise.resolve();
    });

    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation({
        method: 'post',
        url: 'http://localhost:1234/api/homologation/456/risques',
      }, done);
    });

    it('aseptise les paramètres de la requête', (done) => {
      verifieAseptisationParametres(
        ['*', 'risquesSpecifiques.*.description', 'risquesSpecifiques.*.commentaire'],
        { method: 'post', url: 'http://localhost:1234/api/homologation/456/risques' },
        done
      );
    });

    it("demande au dépôt d'associer les risques généraux à l'homologation", (done) => {
      referentiel.recharge({ risques: { unRisque: {} } });
      let risqueAjoute = false;

      depotDonnees.ajouteRisqueGeneralAHomologation = (idHomologation, risque) => new Promise(
        (resolve) => {
          expect(idHomologation).to.equal('456');
          expect(risque.id).to.equal('unRisque');
          expect(risque.commentaire).to.equal('Un commentaire');
          risqueAjoute = true;
          resolve();
        }
      );

      axios.post('http://localhost:1234/api/homologation/456/risques', {
        'commentaire-unRisque': 'Un commentaire',
      })
        .then((reponse) => {
          expect(risqueAjoute).to.be(true);
          expect(reponse.status).to.equal(200);
          expect(reponse.data).to.eql({ idHomologation: '456' });
          done();
        })
        .catch(done);
    });

    it("demande au dépôt d'associer les risques spécifiques à l'homologation", (done) => {
      let risquesRemplaces = false;
      depotDonnees.remplaceRisquesSpecifiquesPourHomologation = (idHomologation, risques) => {
        expect(idHomologation).to.equal('456');
        expect(risques.nombre()).to.equal(1);
        expect(risques.item(0).description).to.equal('Un risque spécifique');
        expect(risques.item(0).commentaire).to.equal('Un commentaire');
        risquesRemplaces = true;
        return Promise.resolve();
      };

      axios.post('http://localhost:1234/api/homologation/456/risques', {
        risquesSpecifiques: [{ description: 'Un risque spécifique', commentaire: 'Un commentaire' }],
      })
        .then(() => expect(risquesRemplaces).to.be(true))
        .then(() => done())
        .catch(done);
    });

    it('filtre les risques spécifiques vides', (done) => {
      let risquesRemplaces = false;
      depotDonnees.remplaceRisquesSpecifiquesPourHomologation = (_, risques) => {
        expect(risques.nombre()).to.equal(1);
        risquesRemplaces = true;
        return Promise.resolve();
      };

      const risquesSpecifiques = [];
      risquesSpecifiques[2] = { description: 'Un risque spécifique' };

      axios.post('http://localhost:1234/api/homologation/456/risques', { risquesSpecifiques })
        .then(() => expect(risquesRemplaces).to.be(true))
        .then(() => done())
        .catch(done);
    });

    it("demande au dépôt d'enregistrer que la liste des risques généraux a été vérifiée", (done) => {
      let listeRisquesMarqueeCommeVerifiee = false;
      depotDonnees.marqueRisquesCommeVerifies = (idHomologation) => new Promise((resolve) => {
        expect(idHomologation).to.equal('456');
        listeRisquesMarqueeCommeVerifiee = true;
        resolve();
      });

      axios.post('http://localhost:1234/api/homologation/456/risques')
        .then(() => expect(listeRisquesMarqueeCommeVerifiee).to.be(true))
        .then(() => done())
        .catch(done);
    });

    it('retourne une erreur HTTP 422 si les données sont invalides', (done) => {
      axios.post('http://localhost:1234/api/homologation/456/risques', {
        'commentaire-unRisqueInvalide': 'Un commentaire',
      })
        .then(() => done('Réponse HTTP OK inattendue'))
        .catch((erreur) => {
          expect(erreur.response.status).to.equal(422);
          expect(erreur.response.data).to.equal('Données invalides');
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête POST sur `/api/homologation/:id/avisExpertCyber`', () => {
    beforeEach(() => (
      depotDonnees.ajouteAvisExpertCyberAHomologation = () => Promise.resolve()
    ));

    it("recherche l'homologation correspondante", (done) => {
      verifieRechercheHomologation({
        method: 'post',
        url: 'http://localhost:1234/api/homologation/456/avisExpertCyber',
      }, done);
    });

    it("demande au dépôt d'associer l'avis d'expert à l'homologation", (done) => {
      let avisAjoute = false;

      depotDonnees.ajouteAvisExpertCyberAHomologation = (idHomologation, avis) => new Promise(
        (resolve) => {
          expect(idHomologation).to.equal('456');
          expect(avis.commentaire).to.equal('Un commentaire');
          avisAjoute = true;
          resolve();
        }
      );

      axios.post('http://localhost:1234/api/homologation/456/avisExpertCyber', {
        commentaire: 'Un commentaire',
      })
        .then((reponse) => {
          expect(avisAjoute).to.be(true);
          expect(reponse.status).to.equal(200);
          expect(reponse.data).to.eql({ idHomologation: '456' });
          done();
        })
        .catch(done);
    });

    it('retourne une erreur HTTP 422 si les données sont invalides', (done) => {
      axios.post('http://localhost:1234/api/homologation/456/avisExpertCyber', {
        avis: 'avisInvalide',
      })
        .then(() => done('Réponse HTTP OK inattendue'))
        .catch((erreur) => {
          expect(erreur.response.status).to.equal(422);
          expect(erreur.response.data).to.equal('Données invalides');
          done();
        })
        .catch(done);
    });
  });

  describe('quand requête GET sur `/utilisateur/edition`', () => {
    it("vérifie que l'utilisateur est authentifié", (done) => {
      const utilisateur = { accepteCGU: () => true };
      depotDonnees.utilisateur = () => new Promise((resolve) => resolve(utilisateur));
      verifieRequeteExigeJWT('http://localhost:1234/utilisateur/edition', done);
    });
  });

  describe('quand requête POST sur `/api/utilisateur`', () => {
    const utilisateur = { id: '123', genereToken: () => 'un token' };

    beforeEach(() => (
      depotDonnees.nouvelUtilisateur = () => new Promise((resolve) => resolve(utilisateur))
    ));

    it('aseptise les paramètres de la requête', (done) => {
      verifieAseptisationParametres(
        ['prenom', 'nom', 'email'],
        { method: 'post', url: 'http://localhost:1234/api/utilisateur' },
        done
      );
    });

    it("demande au dépôt de créer l'utilisateur", (done) => {
      const donneesRequete = { prenom: 'Jean', nom: 'Dupont', email: 'jean.dupont@mail.fr' };

      depotDonnees.nouvelUtilisateur = (donneesUtilisateur) => {
        expect(donneesUtilisateur).to.eql(donneesRequete);
        return Promise.resolve(utilisateur);
      };

      axios.post('http://localhost:1234/api/utilisateur', donneesRequete)
        .then((reponse) => {
          expect(reponse.status).to.equal(200);
          expect(reponse.data).to.eql({ idUtilisateur: '123' });
          done();
        })
        .catch(done);
    });

    it("envoie un message de notification à l'utilisateur créé", (done) => {
      utilisateur.email = 'jean.dupont@mail.fr';
      utilisateur.idResetMotDePasse = '999';

      adaptateurMail.envoieMessageFinalisationInscription = (destinataire, idResetMotDePasse) => {
        expect(destinataire).to.equal('jean.dupont@mail.fr');
        expect(idResetMotDePasse).to.equal('999');
        return Promise.resolve();
      };

      axios.post('http://localhost:1234/api/utilisateur', { desDonnees: 'des donnees' })
        .then(() => done())
        .catch(done);
    });

    describe("si l'envoi de mail échoue", () => {
      beforeEach(() => {
        adaptateurMail.envoieMessageFinalisationInscription = () => Promise.reject(new Error('Oups.'));
        depotDonnees.supprimeUtilisateur = () => Promise.resolve();
      });

      it('retourne une erreur HTTP 424', (done) => {
        verifieRequeteGenereErreurHTTP(
          424, "L'envoi de l'email de finalisation d'inscription a échoué",
          { method: 'post', url: 'http://localhost:1234/api/utilisateur' }, done
        );
      });

      it("supprime l'utilisateur créé", (done) => {
        let utilisateurSupprime = false;
        depotDonnees.supprimeUtilisateur = (id) => {
          expect(id).to.equal('123');

          utilisateurSupprime = true;
          return Promise.resolve();
        };

        axios.post('http://localhost:1234/api/utilisateur', { desDonnes: 'des données' })
          .catch(() => {
            expect(utilisateurSupprime).to.be(true);
            done();
          })
          .catch(done);
      });
    });

    it("génère une erreur HTTP 422 si l'utilisateur existe déjà", (done) => {
      depotDonnees.nouvelUtilisateur = () => Promise.reject(new ErreurUtilisateurExistant());

      verifieRequeteGenereErreurHTTP(
        422, 'Utilisateur déjà existant pour cette adresse email',
        { method: 'post', url: 'http://localhost:1234/api/utilisateur' }, done
      );
    });

    it("génère une erreur HTTP 422 si l'email n'est pas renseigné", (done) => {
      depotDonnees.nouvelUtilisateur = () => Promise.reject(new ErreurEmailManquant());

      verifieRequeteGenereErreurHTTP(
        422, 'Le champ email doit être renseigné',
        { method: 'post', url: 'http://localhost:1234/api/utilisateur' }, done
      );
    });
  });

  describe('quand requête POST sur `/api/reinitialisationMotDePasse`', () => {
    const utilisateur = { email: 'jean.dupont@mail.fr', idResetMotDePasse: '999' };

    beforeEach(() => (
      depotDonnees.reinitialiseMotDePasse = () => Promise.resolve(utilisateur)
    ));

    it('demande au dépôt de réinitialiser le mot de passe', (done) => {
      depotDonnees.reinitialiseMotDePasse = (email) => new Promise((resolve) => {
        expect(email).to.equal('jean.dupont@mail.fr');
        resolve(utilisateur);
      });

      axios.post(
        'http://localhost:1234/api/reinitialisationMotDePasse', { email: 'jean.dupont@mail.fr' }
      )
        .then((reponse) => {
          expect(reponse.status).to.equal(200);
          expect(reponse.data).to.eql({});
          done();
        })
        .catch(done);
    });

    it("envoie un mail à l'utilisateur", (done) => {
      let messageEnvoye = false;

      expect(utilisateur.idResetMotDePasse).to.equal('999');

      adaptateurMail.envoieMessageReinitialisationMotDePasse = (email, idReset) => (
        new Promise((resolve) => {
          expect(email).to.equal('jean.dupont@mail.fr');
          expect(idReset).to.equal('999');
          messageEnvoye = true;
          resolve();
        })
      );

      axios.post(
        'http://localhost:1234/api/reinitialisationMotDePasse', { email: 'jean.dupont@mail.fr' }
      )
        .then(() => expect(messageEnvoye).to.be(true))
        .then(() => done())
        .catch(done);
    });
  });

  describe('quand requête PUT sur `/api/utilisateur`', () => {
    let utilisateur;

    beforeEach(() => {
      utilisateur = { id: '123', genereToken: () => 'un token', accepteCGU: () => true };
      depotDonnees.metsAJourMotDePasse = () => Promise.resolve(utilisateur);
      depotDonnees.utilisateur = () => Promise.resolve(utilisateur);
      depotDonnees.valideAcceptationCGUPourUtilisateur = () => Promise.resolve(utilisateur);
      depotDonnees.supprimeIdResetMotDePassePourUtilisateur = () => Promise.resolve(utilisateur);
    });

    it("vérifie que l'utilisateur est authentifié", (done) => {
      verifieRequeteExigeJWT(
        { method: 'put', url: 'http://localhost:1234/api/utilisateur' }, done
      );
    });

    describe("lorsque l'utilisateur a déjà accepté les CGU", () => {
      it("met à jour le mot de passe de l'utilisateur", (done) => {
        idUtilisateurCourant = utilisateur.id;

        depotDonnees.metsAJourMotDePasse = (idUtilisateur, motDePasse) => new Promise(
          (resolve) => {
            expect(idUtilisateur).to.equal('123');
            expect(motDePasse).to.equal('mdp_12345');
            resolve(utilisateur);
          }
        );

        axios.put('http://localhost:1234/api/utilisateur', { motDePasse: 'mdp_12345' })
          .then((reponse) => {
            expect(reponse.status).to.equal(200);
            expect(reponse.data).to.eql({ idUtilisateur: '123' });
            done();
          })
          .catch(done);
      });

      it('pose un nouveau cookie', (done) => {
        axios.put('http://localhost:1234/api/utilisateur', { motDePasse: 'mdp_12345' })
          .then((reponse) => verifieJetonDepose(reponse, done))
          .catch(done);
      });

      it("invalide l'identifiant de reset", (done) => {
        let idResetSupprime = false;

        expect(utilisateur.id).to.equal('123');
        depotDonnees.supprimeIdResetMotDePassePourUtilisateur = (u) => new Promise((resolve) => {
          expect(u.id).to.equal('123');
          idResetSupprime = true;
          resolve(u);
        });

        axios.put('http://localhost:1234/api/utilisateur', { motDePasse: 'mdp_12345' })
          .then(() => {
            expect(idResetSupprime).to.be(true);
            done();
          })
          .catch(done);
      });

      it('retourne une erreur HTTP 422 si le mot de passe est vide', (done) => {
        verifieRequeteGenereErreurHTTP(422, 'Le mot de passe ne doit pas être une chaîne vide', {
          method: 'put',
          url: 'http://localhost:1234/api/utilisateur',
          data: { motDePasse: '' },
        }, done);
      });
    });

    describe("lorsque utilisateur n'a pas encore accepté les CGU", () => {
      beforeEach(() => (utilisateur.accepteCGU = () => false));

      it('met à jour le mot de passe si case CGU cochée dans formulaire', (done) => {
        let motDePasseMisAJour = false;
        depotDonnees.metsAJourMotDePasse = () => new Promise((resolve) => {
          motDePasseMisAJour = true;
          resolve(utilisateur);
        });

        expect(motDePasseMisAJour).to.be(false);
        axios.put('http://localhost:1234/api/utilisateur', { cguAcceptees: true, motDePasse: 'mdp_12345' })
          .then(() => expect(motDePasseMisAJour).to.be(true))
          .then(() => done())
          .catch(done);
      });

      it("indique que l'utilisateur a coché la case CGU dans le formulaire", (done) => {
        idUtilisateurCourant = utilisateur.id;

        depotDonnees.valideAcceptationCGUPourUtilisateur = (u) => new Promise((resolve) => {
          expect(u.id).to.equal('123');
          resolve(u);
        });

        axios.put('http://localhost:1234/api/utilisateur', { cguAcceptees: true, motDePasse: 'mdp_12345' })
          .then(() => done())
          .catch(done);
      });

      it("retourne une erreur HTTP 422 si la case CGU du formulaire n'est pas cochée", (done) => {
        verifieRequeteGenereErreurHTTP(422, 'CGU non acceptées', {
          method: 'put',
          url: 'http://localhost:1234/api/utilisateur',
          data: { cguAcceptees: false, motDePasse: 'mdp_12345' },
        }, done);
      });
    });
  });

  describe('quand requête POST sur `/api/token`', () => {
    describe("avec authentification réussie de l'utilisateur", () => {
      beforeEach(() => {
        const utilisateur = {
          toJSON: () => ({ prenomNom: 'Jean Dupont' }),
          genereToken: () => 'un token',
        };

        depotDonnees.utilisateurAuthentifie = (login, motDePasse) => new Promise(
          (resolve) => {
            expect(login).to.equal('jean.dupont@mail.fr');
            expect(motDePasse).to.equal('mdp_12345');
            resolve(utilisateur);
          }
        );
      });

      it("retourne les informations de l'utilisateur", (done) => {
        axios.post('http://localhost:1234/api/token', { login: 'jean.dupont@mail.fr', motDePasse: 'mdp_12345' })
          .then((reponse) => {
            expect(reponse.status).to.equal(200);
            expect(reponse.data).to.eql({ utilisateur: { prenomNom: 'Jean Dupont' } });
            done();
          })
          .catch(done);
      });

      it('pose un cookie', (done) => {
        axios.post('http://localhost:1234/api/token', { login: 'jean.dupont@mail.fr', motDePasse: 'mdp_12345' })
          .then((reponse) => verifieJetonDepose(reponse, done))
          .catch(done);
      });

      it("retourne les infos de l'utilisateur", (done) => {
        axios.post('http://localhost:1234/api/token', { login: 'jean.dupont@mail.fr', motDePasse: 'mdp_12345' })
          .then((reponse) => {
            expect(reponse.data).to.eql({ utilisateur: { prenomNom: 'Jean Dupont' } });
            done();
          })
          .catch(done);
      });
    });

    describe("avec échec de l'authentification de l'utilisateur", () => {
      it('retourne un HTTP 401', (done) => {
        depotDonnees.utilisateurAuthentifie = () => new Promise((resolve) => resolve(undefined));

        verifieRequeteGenereErreurHTTP(
          401, "L'authentification a échoué", {
            method: 'post',
            url: 'http://localhost:1234/api/token',
            data: { login: 'jean.dupont@mail.fr', motDePasse: 'mdp_12345' },
          }, done
        );
      });
    });
  });
});
