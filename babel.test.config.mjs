import { buildMacros } from '@embroider/macros/babel';

const macros = buildMacros();

export default {
  generatorOpts: {
    compact: false,
  },
  plugins: [
    '@embroider/addon-dev/template-colocation-plugin',
    [
      'babel-plugin-ember-template-compilation',
      {
        transforms: [...macros.templateMacros],
      },
    ],
    ...macros.babelMacros,
  ],
};
