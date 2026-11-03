const { TypeDataModel } = foundry.abstract;
const f = foundry.data.fields;

/** Personaggio: Foglio Personaggio (note libere) + colore delle biglie. Legami/Problematiche sono Item embedded. */
export class PersonaggioData extends TypeDataModel {
  static defineSchema() {
    return {
      colore: new f.ColorField({ initial: "#d6453d" }),
      eta: new f.StringField({ initial: "", blank: true }),
      vivo: new f.BooleanField({ initial: true }),
      note: new f.HTMLField({ initial: "" }),
    };
  }
}

/** Voce della Tabella dell'Amicizia (Legame o Problematica). */
export class VoceData extends TypeDataModel {
  static defineSchema() {
    return {
      descrizione: new f.HTMLField({ initial: "" }),
      con: new f.ArrayField(
        new f.SchemaField({
          id: new f.StringField({ nullable: true, initial: null }),
          nome: new f.StringField({ initial: "" }),
        }),
      ),
      fase: new f.StringField({ initial: "" }),
      indistruttibile: new f.BooleanField({ initial: false }),
      rimosso: new f.BooleanField({ initial: false }),
      rimossoRacconto: new f.StringField({ initial: "", blank: true }),
    };
  }

  /** "legame" | "problematica" */
  get tipo() {
    return this.parent.type;
  }
}
