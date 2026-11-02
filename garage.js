// All cars and parts are free in this testing build. Credits from earlier builds stay stored.
const REV_CARS = [
    { id: 'gt', name: 'Carrera GT', engine: 'stock', note: 'Original reference', color: '#1565c0', style: 'gt', photo: 'assets/cars/gt.jpg' },
    { id: 'rx7', name: 'RX-7 FD', engine: 'rotary', note: '13B rotary', color: '#e2b83d', style: 'rx7', photo: 'assets/cars/rx7.jpg' },
    { id: 'supra', name: 'Supra MK4', engine: 'twojz', note: '2JZ-GTE', color: '#dc7939', style: 'supra', photo: 'assets/cars/supra.jpg' },
    { id: 'r34', name: 'Skyline R34', engine: 'rb26', note: 'RB26', color: '#2b75b9', style: 'r34', photo: 'assets/cars/r34.jpg' },
    { id: 'mustang', name: 'Mustang', engine: 'v8', note: '289ci V8 sound reference', color: '#505862', style: 'mustang', photo: 'assets/cars/mustang.jpg' },
    { id: 's2000', name: 'S2000', engine: 'f22c', note: 'F22C', color: '#c7443b', style: 's2000', photo: 'assets/cars/s2000.jpg' },
    { id: 'civic', name: 'Civic Type R', engine: 'k20', note: 'K20C1', color: '#d1d9df', style: 'civic', photo: 'assets/cars/civic.jpg' },
    { id: 'lfa', name: 'LFA', engine: 'v10', note: '1LR-GUE', color: '#913a3e', style: 'lfa', photo: 'assets/cars/lfa.jpg' },
    // From the reviewed michael.gaming92 archive: name, engine label, still and a 3 s source excerpt
    // (see assets/engines/sources.json). Engine labels are the uploader's claims.
    { id: 'challenger', name: "Dodge Challenger Scatpack", engine: 'challenger', note: "6.4L 392 HEMI V8", color: '#3b424c', style: 'mustang', photo: 'assets/cars/challenger.jpg' },
    { id: 's240sx', name: "Nissan 240SX", engine: 's240sx', note: "SR20-DET", color: '#a7b0ba', style: 'rx7', photo: 'assets/cars/s240sx.jpg' },
    { id: 's180sx', name: "Nissan 180SX", engine: 's180sx', note: "1JZ-GTE", color: '#a7b0ba', style: 'rx7', photo: 'assets/cars/s180sx.jpg' },
    { id: 'evox', name: "Mitsubishi Evo X", engine: 'evox', note: "4B11T", color: '#3b424c', style: 'civic', photo: 'assets/cars/evox.jpg' },
    { id: 'evo9', name: "Mitsubishi Evo IX", engine: 'evo9', note: "4G63T", color: '#c70010', style: 'civic', photo: 'assets/cars/evo9.jpg' },
    { id: 'satria', name: "Proton Satria Neo", engine: 'satria', note: "4G93 MIVEC TURBO", color: '#3b424c', style: 'civic', photo: 'assets/cars/satria.jpg' },
    { id: 'g35', name: "Infiniti G35", engine: 'g35', note: "VQ35-DETT", color: '#a7b0ba', style: 'supra', photo: 'assets/cars/g35.jpg' },
    { id: 'veilside', name: "Mazda RX-7 Veilside", engine: 'veilside', note: "13B rotary", color: '#c75000', style: 'rx7', photo: 'assets/cars/veilside.jpg' },
    { id: 'r35', name: "Nissan GT-R R35", engine: 'r35', note: "VR38-DETT", color: '#3b424c', style: 'r34', photo: 'assets/cars/r35.jpg' },
    { id: 'wrx', name: "Subaru WRX STI", engine: 'wrx', note: "EJ20", color: '#0947c7', style: 'civic', photo: 'assets/cars/wrx.jpg' },
    { id: 'p1', name: "McLaren P1", engine: 'p1', note: "Rotary 20B", color: '#1a2fc7', style: 'lfa', photo: 'assets/cars/p1.jpg' },
    { id: 'rx7gpu', name: "Mazda RX-7 FD3S", engine: 'rx7gpu', note: "NVIDIA GPU", color: '#6cc71e', style: 'rx7', photo: 'assets/cars/rx7gpu.jpg' },
    { id: 'c8', name: "Chevrolet Corvette C8", engine: 'c8', note: "LT6 V8 5.5L", color: '#3b424c', style: 'lfa', photo: 'assets/cars/c8.jpg' },
    { id: 'mazda787b', name: "Mazda 787B", engine: 'mazda787b', note: "R26B", color: '#c75c28', style: 'lfa', photo: 'assets/cars/mazda787b.jpg' },
    { id: 'hilux', name: "Toyota Hilux", engine: 'hilux', note: "2GD-FTV", color: '#4437c7', style: 'mustang', photo: 'assets/cars/hilux.jpg' },
    { id: 'rwb993', name: "Porsche 993 RWB", engine: 'rwb993', note: "M64 flat-six", color: '#3b424c', style: 'gt', photo: 'assets/cars/rwb993.jpg' },
    { id: 'a90', name: "Toyota Supra A90 MK5", engine: 'a90', note: "B58", color: '#1ac7a8', style: 'supra', photo: 'assets/cars/a90.jpg' },
    { id: 'e92jz', name: "BMW E92", engine: 'e92jz', note: "2JZ-GTE", color: '#70c737', style: 'r34', photo: 'assets/cars/e92jz.jpg' },
    { id: 'm4gts', name: "BMW M4 GTS 2016", engine: 'm4gts', note: "S55B30T1", color: '#3b424c', style: 'r34', photo: 'assets/cars/m4gts.jpg' },
    { id: 'silverado', name: "Chevrolet Silverado", engine: 'silverado', note: "V8 twin turbo LS1", color: '#c70018', style: 'mustang', photo: 'assets/cars/silverado.jpg' },
    { id: 'e92m3', name: "BMW E92 M3", engine: 'e92m3', note: "S65 V8", color: '#3b424c', style: 'r34', photo: 'assets/cars/e92m3.jpg' },
    { id: 'supra30', name: "Toyota Supra 3.0", engine: 'supra30', note: "B58", color: '#c7be20', style: 'supra', photo: 'assets/cars/supra30.jpg' },
    { id: 'r34v12', name: "Nissan Skyline R34", engine: 'r34v12', note: "1GZ-FE V12", color: '#0125c7', style: 'r34', photo: 'assets/cars/r34v12.jpg' },
    { id: 'wira', name: "Proton Wira", engine: 'wira', note: "4G15T", color: '#3b424c', style: 'civic', photo: 'assets/cars/wira.jpg' },
    { id: 'huracan', name: "Lamborghini Huracan STO", engine: 'huracan', note: "LDF V10 5.2", color: '#c70b1c', style: 'lfa', photo: 'assets/cars/huracan.jpg' },
    { id: 'ae86', name: "Toyota Trueno AE86", engine: 'ae86', note: "4A-GE 16V", color: '#c71b1b', style: 'civic', photo: 'assets/cars/ae86.jpg' },
    { id: 'civicek', name: "Honda Civic EK", engine: 'civicek', note: "VTEC K24/K20 stage 2.2", color: '#3b424c', style: 'civic', photo: 'assets/cars/civicek.jpg' },
    { id: 'apx', name: "APX GP-F1", engine: 'apx', note: "Mecachrome V634", color: '#c78e18', style: 'lfa', photo: 'assets/cars/apx.jpg' },
    { id: 'fl5', name: "Honda Civic FL5", engine: 'fl5', note: "K20C1", color: '#0054c7', style: 'civic', photo: 'assets/cars/fl5.jpg' },
    { id: 'brz', name: "Subaru BRZ", engine: 'brz', note: "2JZ-GTE", color: '#3b424c', style: 'supra', photo: 'assets/cars/brz.jpg' },
    { id: 'suprav12', name: "Toyota Supra MK4", engine: 'suprav12', note: "1GZ-FE V12", color: '#c78f46', style: 'supra', photo: 'assets/cars/suprav12.jpg' },
    { id: 'cls63', name: "Mercedes-Benz CLS 63S AMG", engine: 'cls63', note: "M157 DE55 5.5L V8 twin turbo", color: '#3b424c', style: 'gt', photo: 'assets/cars/cls63.jpg' },
    { id: 'dodge37', name: "Dodge Coupe 1937", engine: 'dodge37', note: "8.3L V10 Viper", color: '#3b424c', style: 'mustang', photo: 'assets/cars/dodge37.jpg' },
    { id: 'camaro', name: "Chevrolet Camaro 2SS", engine: 'camaro', note: "GM LS2", color: '#c72b00', style: 'mustang', photo: 'assets/cars/camaro.jpg' }
];
const REV_SHOP = {
    car: [...REV_CARS.map(c => ({ ...c, price: 0, power: 1 })), { id: 'coupe', name: 'Test coupe (legacy)', price: 0, power: 1.03, engine: 'stock', color: '#1565c0' }],
    engine: [
        { id: 'stock', name: 'Carrera GT reference', sound: 'gt', price: 0, power: 1 },
        { id: 'rotary', name: '13B rotary', sound: 'rx7', price: 0, power: 1 },
        { id: 'twojz', name: '2JZ-GTE', sound: 'supra', price: 0, power: 1 },
        { id: 'rb26', name: 'RB26', sound: 'r34', price: 0, power: 1 },
        { id: 'v8', name: '289ci V8', sound: 'mustang', price: 0, power: 1 },
        { id: 'f22c', name: 'F22C', sound: 's2000', price: 0, power: 1 },
        { id: 'k20', name: 'K20C1', sound: 'civic', price: 0, power: 1 },
        { id: 'v10', name: '1LR-GUE', sound: 'lfa', price: 0, power: 1 },
        { id: 'sport', name: 'Sport tune (legacy)', sound: 'gt', price: 0, power: 1.08 },
        ...REV_CARS.slice(8).map(c => ({ id: c.engine, name: c.note, sound: c.id, price: 0, power: 1 }))
    ],
    turbo: [{ id: 'off', name: 'Standard', price: 0, power: 1 }, { id: 'street', name: 'Street turbo', price: 0, power: 1.12 }]
};
class RevGarage {
    constructor(storage) {
        this.storage = storage;
        this.state = { credits: 500, owned: ['car:gt', 'engine:stock', 'turbo:off'], equipped: { car: 'gt', engine: 'stock', turbo: 'off' } };
        try {
            const saved = JSON.parse(storage.getItem('revline-garage-v1'));
            if (saved && Array.isArray(saved.owned)) {
                if (Number.isInteger(saved.credits) && saved.credits >= 0 && saved.credits <= 10000000) this.state.credits = saved.credits;
                for (const category of Object.keys(REV_SHOP)) {
                    for (const item of REV_SHOP[category]) if (saved.owned.includes(`${category}:${item.id}`) && !this.owns(category, item.id)) this.state.owned.push(`${category}:${item.id}`);
                    if (saved.equipped && this.owns(category, saved.equipped[category])) this.state.equipped[category] = saved.equipped[category];
                }
            }
        } catch {}
    }
    owns(category, id) { return this.state.owned.includes(`${category}:${id}`); }
    commit(next) {
        try { this.storage.setItem('revline-garage-v1', JSON.stringify(next)); this.state = next; return true; } catch { return false; }
    }
    claim(id) {
        if (!REV_CARS.some(c => c.id === id)) return 'Choose an available car.';
        if (this.owns('car', id)) return '';
        return this.commit({ ...this.state, owned: [...this.state.owned, `car:${id}`] }) ? '' : 'Could not save your garage. Try again when device storage is available.';
    }
    equip(category, id) {
        const item = Object.hasOwn(REV_SHOP, category) ? REV_SHOP[category].find(i => i.id === id) : null;
        if (!item) return 'Choose an available part.';
        if (category === 'car' && !this.owns('car', id)) return 'Add this free car to your garage in the Store first.';
        const next = JSON.parse(JSON.stringify(this.state));
        if (!this.owns(category, id)) next.owned.push(`${category}:${id}`);
        next.equipped[category] = id;
        if (category === 'car') {
            next.equipped.engine = item.engine;
            if (!next.owned.includes(`engine:${item.engine}`)) next.owned.push(`engine:${item.engine}`);
        }
        return this.commit(next) ? '' : 'Could not save on this device. Your previous setup is still selected.';
    }
    reward() { return 0; }
    // Coins: earned from race results, spent in the Store (prices: frontend/shared/economy.js).
    earn(amount) {
        if (!Number.isInteger(amount) || amount <= 0) return 'Invalid amount.';
        return this.commit({ ...this.state, credits: Math.min(10000000, this.state.credits + amount) }) ? '' : 'Could not save your coins.';
    }
    spend(amount) {
        if (!Number.isInteger(amount) || amount < 0) return 'Invalid amount.';
        if (amount > this.state.credits) return 'Not enough coins.';
        return this.commit({ ...this.state, credits: this.state.credits - amount }) ? '' : 'Could not save your coins.';
    }
    get car() { return REV_SHOP.car.find(c => c.id === this.state.equipped.car); }
    get engine() { return REV_SHOP.engine.find(e => e.id === this.state.equipped.engine); }
    get power() { return Object.entries(this.state.equipped).reduce((power, [category, id]) => power * REV_SHOP[category].find(i => i.id === id).power, 1); }
    get key() { return ['car', 'engine', 'turbo'].map(c => this.state.equipped[c]).join(':'); }
}
if (typeof module !== 'undefined') module.exports = { REV_CARS, REV_SHOP, RevGarage };
