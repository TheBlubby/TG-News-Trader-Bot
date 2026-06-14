import ccxt from "ccxt";
async function main() {
  const exchange = new ccxt.mexc({ options: { defaultType: 'swap'} });
  await exchange.loadMarkets();
  const m = exchange.markets['BTC/USDT:USDT'];
  console.log(m);
}
main();
