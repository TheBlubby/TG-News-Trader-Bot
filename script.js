const axios = require('axios');
axios.get('https://mexcdevelop.github.io/apidocs/contract_v1_en/')
  .then(r => {
     const i = r.data.indexOf('Signature format calculation');
     console.log(r.data.substring(i, i + 800));
  })
  .catch(console.log);
