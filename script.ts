import axios from 'axios';
axios.get('https://mexcdevelop.github.io/apidocs/contract_v1_en/')
  .then(r => {
     const i = r.data.indexOf('Signature format calculation requires appending the parameters');
     console.log(r.data.substring(i, i + 1000).replace(/<[^>]*>?/gm, ''));
  })
  .catch(console.log);
