const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');

const specPath = path.join(__dirname, '..', 'openapi.yaml');

SwaggerParser.validate(specPath)
  .then((api) => {
    console.log(`openapi.yaml es valido (${api.info.title} v${api.info.version}).`);
  })
  .catch((error) => {
    console.error(`openapi.yaml invalido: ${error.message}`);
    process.exit(1);
  });
