/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  name: 'Comunica',
  out: 'documentation',
  theme: 'default',
  entryPointStrategy: 'packages',
  entryPoints: [ 'engines/*', 'packages/*' ],
};
