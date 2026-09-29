import dns from 'dns';
dns.lookup('api.inspecthero.pl', (err, address, family) => {
  console.log('address:', address);
  console.log('err:', err);
  process.exit(0);
});
