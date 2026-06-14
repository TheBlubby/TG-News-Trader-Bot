import ccxt from "ccxt";
async function main() {
  const exchange = new ccxt.mexc({ options: { defaultType: 'swap'} });
  await exchange.loadMarkets();
  
  const symbol = 'BTC/USDT:USDT';
  const amountBase = 0.001666; 
  
  console.log("Formatting base currency amount via amountToPrecision:", exchange.amountToPrecision(symbol, amountBase));
  
  const m = exchange.markets[symbol];
  const amountContracts = amountBase / m.contractSize;
  console.log("Formatting contracts amount via amountToPrecision:", exchange.amountToPrecision(symbol, amountContracts));
  
}
main();
