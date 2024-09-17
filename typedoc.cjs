/** @type {import('typedoc').TypeDocOptions} */
const config = {
  name: 'Comunica',
  out: 'documentation',
  theme: 'default',
  entryPointStrategy: 'packages',
  entryPoints: [ 'engines/*', 'packages/*' ],
};

export default config;
