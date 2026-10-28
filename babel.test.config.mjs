import { buildMacros } from '@embroider/macros/babel';

const macros = buildMacros();

export default {
  generatorOpts: {
    compact: false,
  },
  plugins: [
    // [
    //   '@babel/plugin-transform-typescript',
    //   {
    //     allExtensions: true,
    //     allowDeclareFields: true,
    //     onlyRemoveTypeImports: true,
    //   },
    // ],
    '@embroider/addon-dev/template-colocation-plugin',
    [
      'babel-plugin-ember-template-compilation',
      {
        transforms: [...macros.templateMacros],
      },
    ],
    // [
    //   'module:decorator-transforms',
    //   {
    //     runtime: {
    //       import: 'decorator-transforms/runtime-esm',
    //     },
    //   },
    // ],
    ...macros.babelMacros,
  ],
};
