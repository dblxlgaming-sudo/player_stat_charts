const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
const sandbox={module:{exports:{}},URLSearchParams,window:{location:{search:''}},console};
vm.runInNewContext(source,sandbox);
const {nullableNumber,parseCSV,parseMatchDate,v2Observation,usable,gradeActual,hitRate,selectedObservations}=sandbox.module.exports;

assert.strictEqual(nullableNumber(''),null);
assert.strictEqual(nullableNumber('-'),null);
assert.strictEqual(nullableNumber('0'),0);
assert.strictEqual(usable([{aces:null},{aces:0},{aces:4}],'aces').length,2);
assert.strictEqual(gradeActual(2,2),'push');
assert.deepStrictEqual(JSON.parse(JSON.stringify(hitRate([{v:3},{v:2},{v:1}],'v',2))),{hr:50,avg:'2.0',usable:3,decisions:2,hits:1,pushes:1});
assert.ok(parseMatchDate('46284')>parseMatchDate('46283'));
const parsed=parseCSV('Player,Opponent,Aces\r\n"Doe, Jane","Smith, Ann",\r\n');
assert.strictEqual(parsed[0].Player,'Doe, Jane');
assert.strictEqual(v2Observation({MatchDate:'46284',Aces:'',PlayerSetsWon:'2'}).aces,null);
assert.strictEqual(v2Observation({MatchDate:'46284',Aces:'',PlayerSetsWon:'2'}).psw,2);
const selection=[
  {surface:'Hard',aces:null},{surface:'Hard',aces:5},{surface:'Clay',aces:6},{surface:'Hard',aces:0},{surface:'Hard',aces:4}
];
assert.deepStrictEqual(Array.from(selectedObservations(selection,'aces','Hard',2),m=>m.aces),[5,0]);
console.log('player-stat-charts tests passed');
