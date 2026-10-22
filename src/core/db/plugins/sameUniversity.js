/**
 * Schema plugin for university-scoped models: checks that a referenced document
 * (e.g. a department's faculty) belongs to the SAME university as this document,
 * so data can never be wired across tenants by mistake.
 *
 *   schema.plugin(sameUniversity, { path: 'faculty', model: 'Faculty' });
 */
export default function sameUniversity(schema, { path, model, label = path }) {
  schema.pre('validate', async function () {
    const refId = this.get(path);
    if (!refId || !this.university) return;
    if (!this.isNew && !this.isModified(path) && !this.isModified('university')) return;

    const exists = await this.model(model).exists({
      _id: refId,
      university: this.university,
    });
    if (!exists) {
      this.invalidate(path, `The ${label} must exist and belong to the same university`);
    }
  });
}
