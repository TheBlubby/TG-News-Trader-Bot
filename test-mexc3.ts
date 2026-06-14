import ccxt from "ccxt";
async function main() {
  const exchange = new ccxt.mexc({ options: { defaultType: 'swap'} });
  await exchange.loadMarkets();
  console.log('TON:', exchange.markets['TON/USDT:USDT']?.contractSize);
  console.log('precision:', exchange.markets['TON/USDT:USDT']?.precision);
}
main();
