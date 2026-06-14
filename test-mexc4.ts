import ccxt from "ccxt";
async function main() {
  const exchange = new ccxt.mexc({ options: { defaultType: 'swap'} });
  await exchange.loadMarkets();
  console.log(Object.keys(exchange.markets).filter(s => s.includes('TON')));
}
main();
