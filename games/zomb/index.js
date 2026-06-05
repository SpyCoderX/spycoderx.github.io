

const canvas = document.getElementById('gameCanvas');
const canvasContainer = document.getElementsByClassName('canvas-container')[0];
const ctx = canvas.getContext('2d'); // This is your drawing tool
const shadowCanvas = document.createElement("canvas");
const shadowCtx = shadowCanvas.getContext('2d'); // This is your drawing tool
const imageList = ["head.svg","body.svg","enemy.svg","exp.svg","gun.svg","arm1.svg","arm2.svg","card.svg","card_back.svg","card_glow.svg"]

let imageLibrary = {};
imageList.forEach(val => {
    const img = new Image();
    img.src = val;
    const name = val.split(".")[0];
    imageLibrary[name] = img;
})

class Vector {
    x = 0;
    y = 0;
    constructor(a=null,b=null) {
        if (a instanceof Vector) {
            this.x = a.x;
            this.y = a.y;
        } else if (a != null && b != null) {
            this.x = a;
            this.y = b;
        } else if (a != null) {
            this.x = a;
            this.y = a;
        } else {
            this.x = 0;
            this.y = 0;
        }
    }
    add(other) {
        if (!(other instanceof Vector)) {
            other = new Vector(other);
        }
        return new Vector(this.x+other.x,this.y+other.y);
    }
    sub(other) {
        if (!(other instanceof Vector)) {
            other = new Vector(other);
        }
        return new Vector(this.x-other.x,this.y-other.y);
    }
    mul(other) {
        if (!(other instanceof Vector)) {
            other = new Vector(other);
        }
        return new Vector(this.x*other.x,this.y*other.y);
    }
    div(other) {
        if (!(other instanceof Vector)) {
            other = new Vector(other);
        }
        return new Vector(this.x/other.x,this.y/other.y);
    }

    addMe(other) {
        if (!(other instanceof Vector)) {
            other = new Vector(other);
        }
        this.x += other.x;
        this.y += other.y;
        return this;
    }
    subMe(other) {
        if (!(other instanceof Vector)) {
            other = new Vector(other);
        }
        this.x -= other.x;
        this.y -= other.y;
        return this;
    }
    mulMe(other) {
        if (!(other instanceof Vector)) {
            other = new Vector(other);
        }
        this.x *= other.x;
        this.y *= other.y;
        return this;
    }
    divMe(other) {
        if (!(other instanceof Vector)) {
            other = new Vector(other);
        }
        this.x /= other.x;
        this.y /= other.y;
        return this;
    }
    setMe(other) {
        if (!(other instanceof Vector)) {
            other = new Vector(other);
        }
        this.x = other.x;
        this.y = other.y;
        return this;
    }
    copy() {
        return new Vector(this);
    }

    static fromPolar(radius, theta) {
        return new Vector(Math.cos(theta)*radius,Math.sin(theta)*radius)
    }
    static randomOnCircle(radius=1) {
        return Vector.fromPolar(radius,Math.random()*Math.PI*2)
    }
    static random(scale=1) {
        return new Vector(Math.random(),Math.random).mul(scale);
    }
    static minmax(min,value,max) {
        return new Vector(Math.min(Math.max(value.x,min.x),max.x), Math.min(Math.max(value.y,min.y),max.y))
    }

    angleTo(other) {
        return Math.atan2(
            other.y - this.y,
            other.x - this.x
        )
    }
    distance(other) {
        return Math.sqrt(this.distanceSqr(other))
    }
    distanceSqr(other) {
        return (other.y - this.y)**2+
               (other.x - this.x)**2
    }
    rotate(rot) {
        return new Vector(Math.cos(rot)*this.x - Math.sin(rot)*this.y, Math.cos(rot)*this.y + Math.sin(rot)*this.x);
    }
    rotateMe(rot) {
        let x = Math.cos(rot)*this.x - Math.sin(rot)*this.y
        let y = Math.cos(rot)*this.y + Math.sin(rot)*this.x
        this.x = x;
        this.y = y;
        return this;
    }

    normalize() {
        const len = this.length();
        this.x /= len;
        this.y /= len;
        return this;
    }
    length() {
        return Math.sqrt(this.x*this.x + this.y*this.y);
    }
    lengthSqr() {
        return this.x*this.x + this.y*this.y;
    }
    angle() {
        return Math.atan2(
            this.y,
            this.x
        )
    }
}

function interpolate(p1,p2,count) {
    count -= 1; // This way, if count is 2, it becomes one and we loop 0,1
    // If count is 5, it becomes 4, and we loop 0,1,2,3,4 
    // This also affects the progress, so for 5 total points (above), we get 0, 0.25, 0.5, 0.75, 1
    let points = [];
    for (let i = 0; i <= count; i++) {
        const progress = (i / count);
        points.push(p1.mul(1 - progress).add(p2.mul(progress)));
    }
    return points
}

class Trace {
    points = [];
    vels = [];
    age = 1;
    maxLifetime = 90;
    constructor(_start,_end,_initialMovement=new Vector(),_spacing=35) {
        const dist = _start.distance(_end);
        const dir = _end.sub(_start).div(dist).mul(3);
        for (let i = 0; i < 1; i += _spacing/dist) {
            const pos = _start.mul(1-i).add(_end.mul(i))
            this.points.push(pos);
            this.vels.push(Vector.randomOnCircle().add(_initialMovement).add(dir.mul(i?1:0)));

        }
        this.points.push(_end.copy());
        this.vels.push(Vector.randomOnCircle().add(_initialMovement.add(dir)));
    
    }
    move() {
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const v = this.vels[i];
            p.addMe(v.mul(5 / this.age + 0.5).mul(0.3));
        }
    }
    tick() {
        this.move();
        this.age += 1;
    }
    render() {
        if (this.age <= 6) {
            game.drawLongLine(false,`rgba(250,220,150,0.2)`,interpolate(this.points[0],this.points[this.points.length-1],25),3 / (this.age / 2)**2);
            game.drawLongLine(false,`rgba(250,220,150,0.2)`,interpolate(this.points[0],this.points[this.points.length-1],25),2 / (this.age / 2)**2);
        }
        game.drawLongLine(false,`rgba(255,255,255,${1 / (this.age) - (this.age / (this.maxLifetime*this.maxLifetime))})`,this.points,1.3 / this.age + 0.6);
    }
}

class PlayerStats {
    experience = 0;
    maxExperience = 20;
    MaxHP = 5;
    HP = this.MaxHP;
    level = 0;
    bullets = 1;
    spread = 0.05;
    reload = 20;
    speed = 1;
    damage = 1;
    modify(stat,amount) {
        switch (stat) {
            case "spread": this.spread = this.addPossibleStat(stat,amount)
            case "bullets": this.bullets = this.addPossibleStat(stat,amount)
            case "reload": this.reload = this.addPossibleStat(stat,amount)
            case "damage": this.damage = this.addPossibleStat(stat,amount)
            case "speed": this.speed = this.addPossibleStat(stat,amount)
            case "HP": this.HP = this.addPossibleStat(stat,amount)
            case "MaxHP": this.MaxHP = this.addPossibleStat(stat,amount)
            case "enemyHP": game.enemyHP = this.addPossibleStat(stat,amount)
            case "enemiesPerMinute": game.enemyPerMinute = this.addPossibleStat(stat,amount)
        }
    }
    addPossibleStat(stat,amount) {
        switch (stat) {
            case "spread": return Math.max(this.spread + amount,0)
            case "bullets": return Math.max(Math.round(this.bullets + amount),1)
            case "reload": return Math.max(this.reload + amount,0)
            case "damage": return Math.max(this.damage + amount,1)
            case "speed": return Math.max(this.speed + amount,0.1)
            case "HP": return Math.max(Math.round(this.HP + amount),0)
            case "MaxHP": return Math.max(Math.round(this.MaxHP + amount),1)
            case "enemyHP": return Math.max(Math.round(game.enemyHP + amount),1)
            case "enemiesPerMinute": return Math.max(game.enemyPerMinute + amount,1)
            default: return 0
        }
    }
    getStat(stat) {
        switch (stat) {
            case "enemyHP": return game.enemyHP;
            case "enemiesPerMinute": return game.enemyPerMinute;
            default: return this[stat];
        }
    }
}

class Player {
    inputMap = new Vector();
    vel = new Vector();
    pos = new Vector();
    size = new Vector(60);
    collider = new Vector(30,20);
    rot = 0;
    weaponCooldown = 0;
    invulnerabilityTicks = 0;
    stats = new PlayerStats();
    recoil = 0;
    constructor() {
    }
    damage(n) {
        if (this.invulnerabilityTicks > 0){
            return;
        }
        this.stats.HP -= n;
        this.invulnerabilityTicks = 20;
    }
    getMaxExperience() {
        return this.stats.maxExperience;
    }
}
class Zombie {
    pos = new Vector();
    vel = new Vector();
    rot = 0;
    MaxHP = Math.round(0.5 * (1 + Math.random()) * game.enemyHP); // Random HP between enemyHP and enemyHP / 2
    size = new Vector(60).mul(1+(this.MaxHP-2)/8);
    collider = new Vector(25,50).mul(1+(this.MaxHP-2)/8);
    HP = this.MaxHP;
    constructor(_pos) {
        this.pos = _pos.copy();
    }
    damage(n,src,force=3) {
        this.HP -= n;
        this.vel.addMe(this.pos.sub(src).normalize().mul(force));
    }
}

class EXP {
    pos = new Vector();
    vel = new Vector();
    time = 0;
    dead = false;
    constructor(_pos,_vel) {
        this.pos = new Vector(_pos);
        this.vel = new Vector(_vel);
    }
    tick() {
        this.pos.addMe(this.getVel());
        if (this.pos.distance(game.player.pos) < this.time) {
            this.dead = true;
        }
        this.time += 1;
    }
    getVel() {
        return this.vel.add(Vector.fromPolar(this.time,this.pos.angleTo(game.player.pos)));
    }
}

class Game {
    center = new Vector();
    camera = new Vector();
    mouse = new Vector();
    scroll = new Vector();
    followMouse = new Vector();
    player = new Player();
    keys = {};
    ticks = 0;
    paused = false;
    enemyPerMinute = 60;
    enemyHP = 2;
    mode = "play";
    cards = [];

    getSmoothMousePos() {
        return this.followMouse.mul(this.getInverseScale());
    }
    getMousePos() {
        return this.mouse.mul(this.getInverseScale())//.add(this.camera.sub(this.player.pos));
    }

    setMode(newMode) {
        this.mode = newMode;
    }

    restart() {
        this.player = new Player();
        zombies.length = 0; // Seems weird, but JS jank ig?
        traces.length = 0;
        this.enemyPerMinute = 60;
        this.enemyHP = 2;
    }

    openUpgrades() {
        this.setMode("upgrade");
        this.cards = [new Card(0), new Card(1), new Card(2)];
    }
    levelUp() {
        this.player.stats.experience = Math.max(this.player.stats.experience - this.player.stats.maxExperience,0);
        this.player.level += 1;
        //this.player.bullets += 1;
        //this.enemyPerMinute *= 1.2;
        //this.enemyHP += 1;
        this.player.stats.maxExperience += 10;
        this.openUpgrades();
    }

    upgradeTick() {
        this.cards.forEach(card => card.tick());
    }

    update() {
        for (const key in this.keys) {
            let state = this.getKeyState(key);
            if (this.getKey(key) == true) {
                if (this.getKeyState(key) == "none") {
                    state = "press";
                }
                else if (this.getKeyState(key) == "press") {
                    state = "hold";
                } 
            } else {
                if (this.getKeyState(key) == "release") {
                    state = "none";
                }
                else if (this.getKeyState(key) == "press" || this.getKeyState(key) == "hold") {
                    state = "release";
                }
            }
            this.keys[key].state = state;
            
        }
        if (this.getKeyState('p') == "press") {
            this.pause = !this.pause;
        }
        const inputMap = new Vector(this.getKey("d") - this.getKey("a"), this.getKey("s") - this.getKey("w"));;

        if (this.pause) {
            this.camera.addMe(inputMap.mul(8));
        }

        if (this.mode == "upgrade") {
            this.upgradeTick();
        }


        if (this.isPaused()) {
            return;
        }
        this.ticks += 1;
        if (this.ticks%Math.floor(3600/this.enemyPerMinute) == 0) {
            zombies.push(new Zombie(this.player.pos.add(Vector.fromPolar(600,Math.random()*Math.PI*2))))
        }
        this.camera.mulMe(0.9);
        this.camera.addMe(this.player.pos.mul(0.1));
        this.followMouse.mulMe(0.7);
        this.followMouse.addMe(this.mouse.mul(0.3));

        this.player.inputMap = inputMap;
        this.player.vel.addMe(this.player.inputMap.mul(this.player.stats.speed));
        this.player.vel.mulMe(0.8);
        this.player.pos.addMe(this.player.vel);

        

        this.player.rot = this.player.pos.sub(this.camera).angleTo(this.getSmoothMousePos())
        
        for (let i = 0; i < zombies.length; i++) {
            const zomb = zombies[i];
            zomb.rot = zomb.pos.angleTo(this.player.pos);
            zomb.vel.addMe(Vector.fromPolar(0.5,zomb.rot))
        }
        for (let n = 0; n < 2; n++) {
            for (let i = 0; i < zombies.length; i++) {
                const zomb = zombies[i];
                for (let j = 0; j < zombies.length; j++) {
                    const otherZomb = zombies[j];
                    if (otherZomb == zomb) continue;
                    const p1 = zomb.pos.add(zomb.vel.div(4));
                    const p2 = otherZomb.pos.add(otherZomb.vel.div(4));
                    const targetLen = (zomb.collider.length() + otherZomb.collider.length()) / 2.0;
                    const len = p1.distance(p2);
                    if (len < targetLen) {
                        let dir = p2.angleTo(p1);
                        dir = Vector.fromPolar((targetLen - len) / 8,dir);
                        zomb.vel.addMe(dir);
                        otherZomb.vel.subMe(dir);
                    }
                }
                const p1 = zomb.pos.add(zomb.vel.div(4));
                const p2 = this.player.pos.add(this.player.vel.div(4));
                const targetLen = (zomb.collider.length() + this.player.collider.length()) / 2.0;
                const len = p1.distance(p2);
                if (len < targetLen) {
                    let dir = p2.angleTo(p1);
                    dir = Vector.fromPolar((targetLen - len) / 8,dir);
                    zomb.vel.addMe(dir);
                    this.player.damage(1);
                }
            }

            for (let i = 0; i < zombies.length; i++) {
                const zomb = zombies[i];
                zomb.pos.addMe(zomb.vel.div(2));
                zomb.vel.mulMe(Math.pow(0.7,0.5)); // 4th root of 0.7
                
            }
        }
        for (let i = 0; i < zombies.length; i++) {
            const zomb = zombies[i];
            if (zomb.HP <= 0) {
                for (let j = 0; j < 3; j++) {
                    const angle = zomb.pos.angleTo(this.player.pos);
                    const xp = new EXP(zomb.pos,Vector.fromPolar(Math.random() * 4 + 4,angle + (Math.round(Math.random()) - 0.5) * Math.PI + (Math.random() - 0.5) * Math.PI * 0.5));
                    exp.push(xp);
                }
                zombies.splice(i,1);
                i--;
            }
        }
        for (let i = 0; i < exp.length; i++) {
            const xp = exp[i];
            xp.tick();
            if (xp.dead) {
                exp.splice(i,1);
                game.player.stats.experience += 1;
                i--;
            }
        }

        for (let i = 0; i < traces.length; i++) {
            const trace = traces[i];
            trace.tick();
            if (trace.age > trace.maxLifetime) {
                traces.splice(i,1);
                i--;
            }
        }
        if ((this.getKeyState('mouse') == "press" || this.getKeyState('mouse') == "hold") && this.player.weaponCooldown == 0) {
            //bullets.push(new Bullet(this.player.pos,this.player.rot));
            const angle = this.player.pos.sub(this.camera).angleTo(this.getMousePos());
            for (let i = 0; i < this.player.stats.bullets; i++) {
                const start = this.player.pos.add(new Vector(39,7).rotate(angle));
                const max = Vector.fromPolar(1200,angle + (Math.random() - 0.5)*this.player.stats.spread).add(start);
                const {pos:end,entity:hit} = this.rayTraceEnemies(start,max);
                if (hit != null) {
                    hit.damage(this.player.stats.damage,this.player.pos)
                }
                const trace = new Trace(start,end,this.player.vel);
                traces.push(trace)
            }
            this.player.weaponCooldown = this.player.stats.reload;
        }
        if (this.player.weaponCooldown > 0) {
            this.player.weaponCooldown -= 1;
        }
        if (this.player.invulnerabilityTicks > 0) {
            this.player.invulnerabilityTicks -= 1;
        }
        if (this.player.stats.experience >= this.player.stats.maxExperience) {
            this.levelUp();
        }
        if (this.player.stats.HP <= 0) {
            this.restart();
        }
    }
    
    rayTraceEnemies(_start,_end) {
        const offsetEnd = _end.sub(_start);
        const lengthSqr = _start.distanceSqr(_end);
        let closest = {pos:_end,entity:null};
        let closestDist = 100000000000;
        for (const zomb of zombies) {
            if (zomb.HP < 0) continue;
            const radius = (zomb.collider.x * zomb.collider.x + zomb.collider.y * zomb.collider.y) / 4;
            const offsetPos = zomb.pos.sub(_start);
            const dot = Math.abs(offsetEnd.x * offsetPos.x + offsetEnd.y * offsetPos.y);
            const posOnLine = offsetEnd.mul(Math.max(Math.min(dot/lengthSqr,1),0)).add(_start);
            //this.drawCircle('rgba(255,255,0,1)',zomb.pos,Math.sqrt(radius),1)
            if (posOnLine.distanceSqr(zomb.pos) > radius) {
                continue;
            }
            const points = [zomb.collider.copy(),zomb.collider.mul(new Vector(1,-1)),zomb.collider.mul(new Vector(-1,-1)),zomb.collider.mul(new Vector(-1,1))]
            points.forEach(p => p.divMe(2).rotateMe(zomb.rot).addMe(zomb.pos));
            for (let i = 0; i < 4; i++) {
                const p1 = points[i];
                const p2 = points[(i+1)%4];
                //this.drawLine('rgba(255,100,0,1)',p1,p2,1)
                // _start = x1,y1
                // _end = x2,y2
                // p1 = x3,y3
                // p2 = x4,y4
                const delta1 = _end.sub(_start); // x2-x1, y2-y1
                const delta2 = p2.sub(p1); // x4-x3, y4-y3
                const delta3 = _start.sub(p1); // x1-x3, y1-y3
                const denom = delta1.x * delta2.y - delta1.y * delta2.x;
                if (Math.abs(denom) < 0.000001) continue;
                const t = (delta2.x * delta3.y - delta2.y * delta3.x) / denom;
                const u = (delta1.x * delta3.y - delta1.y * delta3.x) / denom;
                if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
                    let pos = _start.add(delta1.mul(t));
                    if (pos.distanceSqr(_start) < closestDist) {
                        closest = {pos:pos,entity:zomb};
                        closestDist = pos.distanceSqr(_start);
                    }
                }

            }

        }
        return closest;
    }

    getScale() {
        return new Vector(Math.pow(10,this.scroll.y / -1000));
    }
    getInverseScale() {
        return new Vector(Math.pow(10,this.scroll.y / 1000));
    }


    draw(isUI,image,location,size,rot=0,upwards=false) {
        if (image.complete && image.naturalWidth == 0) {
            this.drawBox('red',location,size,rot,upwards);
            return;
        }
        ctx.save();
        const offset = location.copy();
        if (!isUI) {
            offset.subMe(this.camera);
            offset.mulMe(this.getScale());
            size = size.mul(this.getScale());
        }
        offset.addMe(this.center);
        ctx.translate(offset.x,offset.y);
        if (upwards) {
            ctx.rotate(rot+Math.PI/2);
        } else {
            ctx.rotate(rot);
        }
        const halfSize = size.div(2);
        ctx.drawImage(image,-halfSize.x,-halfSize.y,size.x,size.y);
        ctx.restore();
    }
    drawTextFill(isUI,text,color,font,location,textAlign="center",textBaseline="top",rot=0,maxWidth=1000) {
        ctx.save();
        const offset = location.copy();
        if (!isUI) {
            offset.subMe(this.camera);
            offset.mulMe(this.getScale());
        }
        offset.addMe(this.center);
        ctx.translate(offset.x,offset.y);
        ctx.rotate(rot);
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = textAlign;
        ctx.textBaseline = textBaseline;
        ctx.fillText(text,0,0,maxWidth);
        ctx.restore();
    }
    drawText(isUI,text,color,font,location,textAlign="center",textBaseline="top",rot=0,maxWidth=1000) {
        ctx.save();
        const offset = location.copy();
        if (!isUI) {
            offset.subMe(this.camera);
            offset.mulMe(this.getScale());
        }
        offset.addMe(this.center);
        ctx.translate(offset.x,offset.y);
        ctx.rotate(rot);
        ctx.font = font;
        ctx.strokeStyle = color;
        ctx.textAlign = textAlign;
        ctx.textBaseline = textBaseline;
        ctx.strokeText(text,0,0,maxWidth);
        ctx.restore();
    }

    drawBox(isUI,color,location,size,rot=0,upwards=false,width=1) {
        ctx.save();
        const offset = location.copy();
        if (!isUI) {
            offset.subMe(this.camera);
            offset.mulMe(this.getScale());
            size = size.mul(this.getScale());
            width *= this.getScale().x;
        }
        offset.addMe(this.center);
        ctx.translate(offset.x,offset.y);
        if (upwards) {
            ctx.rotate(rot+Math.PI/2);
        } else {
            ctx.rotate(rot);
        }
        const halfSize = size.div(2);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.strokeRect(-halfSize.x,-halfSize.y,size.x,size.y);
        ctx.restore();
    }
    drawBoxFill(isUI,color,location,size,rot=0,upwards=false) {
        ctx.save();
        const offset = location.copy();
        if (!isUI) {
            offset.subMe(this.camera);
            offset.mulMe(this.getScale());
            size = size.mul(this.getScale());
        }
        offset.addMe(this.center);
        ctx.translate(offset.x,offset.y);
        if (upwards) {
            ctx.rotate(rot+Math.PI/2);
        } else {
            ctx.rotate(rot);
        }
        const halfSize = size.div(2);
        ctx.fillStyle = color;
        ctx.fillRect(-halfSize.x,-halfSize.y,size.x,size.y);
        ctx.restore();
    }
    drawCircle(isUI,color,c,radius,width=1) {
        ctx.strokeStyle = color;
        ctx.fillStyle = '';
        const pos = c.copy();
        if (!isUI) {
            pos.subMe(this.camera);
            pos.mulMe(this.getScale());
            radius *= this.getScale().x;
            width *= this.getScale().x;
        }
        pos.addMe(this.center);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(pos.x,pos.y,radius,0,Math.PI*2);
        ctx.stroke();
    }
     drawCircleFill(isUI,color,c,radius) {
        ctx.fillStyle = color;
        ctx.strokeStyle = '';
        const pos = c.copy();
        if (!isUI) {
            pos.subMe(this.camera);
            pos.mulMe(this.getScale());
            radius *= this.getScale().x;
        }
        pos.addMe(this.center);
        ctx.beginPath();
        ctx.arc(pos.x,pos.y,radius,0,Math.PI*2);
        ctx.fill();
    }
    drawLine(isUI,color,start,end,width=1) {
        ctx.strokeStyle = color;
        const offsetStart = start.copy()// this.center.add(start).sub(this.camera);
        const offsetEnd = end.copy()// this.center.add(end).sub(this.camera);
        if (!isUI) {
            offsetStart.subMe(this.camera);
            offsetEnd.subMe(this.camera);
            offsetStart.mulMe(this.getScale());
            offsetEnd.mulMe(this.getScale());
            width *= this.getScale().x;
        }
        offsetStart.addMe(this.center);
        offsetEnd.addMe(this.center);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(offsetStart.x,offsetStart.y);
        ctx.lineTo(offsetEnd.x,offsetEnd.y);
        ctx.stroke();
    }
    drawLongLine(isUI,color,points,width=1) {
        const originalPoints = points;
        ctx.strokeStyle = color;
        const offsetStart = points[0].copy()// this.center.add(start).sub(this.camera);
        if (!isUI) {
            offsetStart.subMe(this.camera);
            offsetStart.mulMe(this.getScale());
            points = points.map(p => p.sub(this.camera).mul(this.getScale()));
            width *= this.getScale().x;
        }
        ctx.lineWidth = width;
        points = points.map(p => p.add(this.center));
        offsetStart.addMe(this.center);
        ctx.beginPath();
        ctx.moveTo(offsetStart.x,offsetStart.y);
        let onScreenPrevious = true;
        for (let i = 1; i < points.length; i++) {
            const point = points[i];
            const onScreen = this.isOnScreen(originalPoints[i]);
            if (!onScreen && !onScreenPrevious) ctx.moveTo(point.x,point.y);
            else ctx.lineTo(point.x,point.y);
            onScreenPrevious = onScreen;
        }
        ctx.stroke();
    }

    onMouseMove(event) {
        const rect = canvas.getBoundingClientRect();

        this.mouse.setMe(
            new Vector(
                event.clientX - rect.left,
                event.clientY - rect.top
            ).sub(this.center)
        );

        
    }
    onKeyDown(event) {
        this.setKey(event.key,true);
    }
    onKeyUp(event) {
        this.setKey(event.key,false);
    }
    onMouseDown(event) {
        this.setKey('mouse',true);
    }
    onMouseUp(event) {
        this.setKey('mouse',false);
    }
    onScrollWheel(event) {
        const rect = canvas.getBoundingClientRect();
        if (rect.left < event.clientX && event.clientX < rect.right && rect.top < event.clientY && event.clientY < rect.bottom) {
            event.preventDefault();
        }
        this.scroll.addMe(new Vector(event.deltaX,event.deltaY));
    }
    setKey(key,active) {
        if (this.keys[key] == null) {
        this.keys[key] = {active:false,state:"none"};
        }
        this.keys[key].active = active;

    }
    getKey(key) {
        return this.keys[key]?.active ?? false;
    }
    getKeyState(key) {
        return this.keys[key]?.state ?? "none";
    }
    isOnScreen(pos) {
        pos = pos.sub(this.camera).mul(this.getScale()).div(this.center);
        return Math.abs(pos.x) <= 1 && Math.abs(pos.y) <= 1;
    }
    isPaused() {
        return this.pause || this.mode != "play";
    }
}

class ShadowManager {
    shadows = []
    addShadow(p1,p2) {
        this.shadows.push(new Shadow(p1,p2))
    }
    drawShadows() {
        let points = [];
        for (const shadow of this.shadows) {
            // game.drawLine(false,'rgba(100,100,100,1)',shadow.point1,shadow.point2,2)
            const resultLeft = this.rayTraceShadow(game.player.pos,shadow.point1)
            const resultRight = this.rayTraceShadow(game.player.pos,shadow.point2)
            const dirLeft = game.player.pos.angleTo(shadow.point1) - 0.001;
            const p2 = game.player.pos.add(Vector.fromPolar(2000,dirLeft));
            const resultLeftPlus = this.rayTraceShadow(game.player.pos,p2)
            const dirRight = game.player.pos.angleTo(shadow.point2) + 0.001;
            const p3 = game.player.pos.add(Vector.fromPolar(2000,dirRight));
            const resultRightPlus = this.rayTraceShadow(game.player.pos,p3)
            
            points.push(resultLeftPlus.pos)
            points.push(resultLeft.pos)
            points.push(resultRight.pos)
            points.push(resultRightPlus.pos)
            if (game.getKey("g")) {
                game.drawLine(false,'rgba(255,50,50,1)',shadow.point1,resultLeftPlus.pos,1)
                game.drawLine(false,'rgba(255,50,50,1)',shadow.point1,resultLeft.pos,1)
                game.drawLine(false,'rgba(255,50,50,1)',shadow.point2,resultRight.pos,1)
                game.drawLine(false,'rgba(255,50,50,1)',shadow.point2,resultRightPlus.pos,1)

            }

        }
        // Default octogon so that there is at least some points outside the screen.
        for (let i = 0; i < 8; i++) {
            const outer = this.rayTraceShadow(game.player.pos,game.player.pos.add(Vector.fromPolar(2000,i * (Math.PI / 4))))
            points.push(outer.pos);
        }

        points.sort((p1,p2) => game.player.pos.angleTo(p1) - game.player.pos.angleTo(p2))
        for (let i = 0; i < points.length; i++) {
            if (game.getKey("g")) {
                game.drawCircle(false,'rgba(255,50,50,1)',points[i],2,0.2)
                // game.drawLine(false,'rgba(255,50,50,0.2)',game.player.pos,points[i],0.2)
            }
        }

        shadowCtx.fillStyle = 'rgba(0,0,0,0.7)';
        shadowCtx.fillRect(0,0,canvas.width,canvas.height);

        shadowCtx.save();
        shadowCtx.globalCompositeOperation = "destination-out";
        shadowCtx.fillStyle = 'rgba(255,255,255,1)';
        shadowCtx.beginPath();
        points = points.map(p => p.sub(game.camera).mul(game.getScale()).add(game.center))
        const p0 = points[0];
        shadowCtx.moveTo(p0.x,p0.y)
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            shadowCtx.lineTo(p.x,p.y);
        }

        shadowCtx.closePath();
        shadowCtx.fill();

        shadowCtx.restore();
        shadowCtx.globalCompositeOperation = "source-over";

        ctx.drawImage(shadowCanvas,0,0)
    }
    clearShadows() {
        this.shadows.length = 0;
    }
    rayTraceShadow(_start,_end,_this=null) {
        const offsetEnd = _end.sub(_start);
        const lengthSqr = _start.distanceSqr(_end);
        let closest = {pos:_end,shadow:null};
        let closestDist = 100000000000;
        for (const shadow of this.shadows) {
            if (_this === shadow) continue;
            const radiusSqr = shadow.size * shadow.size;
            const offsetPos = shadow.center.sub(_start);
            const dot = Math.abs(offsetEnd.x * offsetPos.x + offsetEnd.y * offsetPos.y);
            const posOnLine = offsetEnd.mul(Math.max(Math.min(dot/lengthSqr,1),0)).add(_start);
            //game.drawLine(false,'rgba(255,255,0,1)',shadow.point1,shadow.point2,1)
            //game.drawCircle(false,'rgba(255,255,0,1)',shadow.center,Math.sqrt(radiusSqr),1)
            if (posOnLine.distanceSqr(shadow.center) > radiusSqr) {
                continue;
            }
            const p1 = shadow.point1;
            const p2 = shadow.point2;
            //game.drawLine(false,'rgba(255,100,0,1)',p1,p2,1)
            // _start = x1,y1
            // _end = x2,y2
            // p1 = x3,y3
            // p2 = x4,y4
            const delta1 = _end.sub(_start); // x2-x1, y2-y1
            const delta2 = p2.sub(p1); // x4-x3, y4-y3
            const delta3 = _start.sub(p1); // x1-x3, y1-y3
            const denom = delta1.x * delta2.y - delta1.y * delta2.x;
            if (Math.abs(denom) < 0.000001) continue;
            const t = (delta2.x * delta3.y - delta2.y * delta3.x) / denom;
            const u = (delta1.x * delta3.y - delta1.y * delta3.x) / denom;
            if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
                let pos = _start.add(delta1.mul(t));
                if (pos.distanceSqr(_start) < closestDist) {
                    closest = {pos:pos,shadow:shadow};
                    closestDist = pos.distanceSqr(_start);
                }
            }

        }
        return closest;
    }
}
class Shadow {
    point1 = new Vector();
    point2 = new Vector();
    center = new Vector();
    size = 0;
    constructor(p1,p2) {
        this.point1 = p1;
        this.point2 = p2;
        this.center = p1.add(p2).div(2);
        this.size = p1.distance(p2) / 2;
    }
}

class Card {
    index;
    time = 0;
    interpolatedScale = 0;
    modifier = possibleModifiers[Math.floor(Math.random()*possibleModifiers.length)];
    constructor(index) {
        this.index = index;
    }
    tick() {
        this.time++;
    }
    render() {
        const pos = new Vector((this.index - 1) * 500, 0);
        const size = new Vector(200,300);
        let scale = 1.2;
        let useInterpolatedSize = true;
        let image = imageLibrary["card"];
        const indexOffset = this.index * 10
        if (this.time < indexOffset + 30) {
            let progress = Math.max(this.time - indexOffset,0) / 30;
            progress = Math.pow(1 - progress, 4);
            const yDist = 150 + game.center.y;
            pos.subMe(new Vector(0,yDist * progress))
        }

        
        let interactable = false;
        if (this.time < 50) {
            image = imageLibrary["card_back"];
            useInterpolatedSize = false;

        } else if (this.time < 80) {
            let progress = (this.time - 50) / 30;
            progress = Math.cos(progress * Math.PI) / -2 + 0.5;
            if (progress < 0.5) {
                image = imageLibrary["card_back"];
                size.mulMe(new Vector(1 - 2 * progress,1))
            } else { 
                size.mulMe(new Vector(2 * progress - 1,1))
            }
            useInterpolatedSize = false;
        } else {
            interactable = true;
        }
        if (interactable) {
            let mouse = game.mouse.copy();
            mouse.subMe(pos);
            mouse.divMe(size);
            const isHovered = Math.abs(mouse.x) < 0.5 && Math.abs(mouse.y) < 0.5;
            if (isHovered) {
                scale = 1.5;
                image = imageLibrary["card_glow"]
                if (game.getKeyState("mouse") == 'release') {
                    for (const key in this.modifier) {
                        if (!game.player.stats.hasOwnProperty(key)) continue;
                        game.player.stats.modify(key,this.modifier[key]);
                    }
                    game.setMode("play")
                }
            }
        }
        if (useInterpolatedSize) {
            this.interpolatedScale *= 0.6
            this.interpolatedScale += scale * 0.4;
        } else {
            this.interpolatedScale = scale;
        }
        game.draw(true,image,pos,size.mul(new Vector(this.interpolatedScale)))
        
        let textAlpha = Math.min(Math.max((this.time - 80) / 20,0), 1);
        
        game.drawTextFill(true,this.modifier.name,colorGradient(new Vector(0,0),new Vector(200*this.interpolatedScale,0),`rgba(255,255,255,0)`,`rgba(255,255,255,1)`,textAlpha),`${18*this.interpolatedScale}px monospaced`,pos.sub(size.mul(new Vector(this.interpolatedScale)).div(2)).add(new Vector(35*this.interpolatedScale)),"left","top",0)
        
        let i = 1;
        for (const key in this.modifier) {
            if (key == "name") continue;
            let val = this.modifier[key];
            let sum = game.player.stats.addPossibleStat(key,val);
            if (typeof val == 'number') {
                if (val > 0) {
                    val = `+${val}`;
                }
            }
            if (key == "reload") {
                val = `${Math.round(val/60 * 100)/100}s (${Math.round(sum/60 * 100)/100}s)`
            }
            else if (key == "speed") {
                val = `${val}x (${sum}x)`
            }
            else {
                val = `${val} (${sum})`
            }
            game.drawTextFill(true,`${key.charAt(0).toUpperCase() + key.slice(1)}: ${val}`,colorGradient(new Vector(0,0),new Vector(200*this.interpolatedScale,0),`rgba(255,255,255,0)`,`rgba(255,255,255,1)`,textAlpha),`${14*this.interpolatedScale}px monospaced`,pos.sub(size.mul(new Vector(this.interpolatedScale)).div(2)).add(new Vector(35,40 + i*25).mul(this.interpolatedScale)),"left","top",0)
            i += 1;
        }
    }
}


class CardModifier {
    name = "";
    constructor(object) {
        if (object) {
            for (const key in object) {
                this[key] = object[key];
            }
        }
    }
}



const possibleModifiers = [
    new CardModifier({name:"Machine Gun",bullets:1,reload:-10,spread:0.1}),
    new CardModifier({name:"Sniper",reload:30,spread:-0.3,damage:1}),
    new CardModifier({name:"Quick Hands",reload:-15,speed:0.25}),
    new CardModifier({name:"Scattershot",bullets:2,spread:0.12,reload:10}),
    new CardModifier({name:"Precision",spread:-0.08}),
    new CardModifier({name:"Heavy Rounds",damage:2,reload:20}),
    new CardModifier({name:"Lightweight",speed:0.4,MaxHP:-1}),
    new CardModifier({name:"Fortitude",MaxHP:2,HP:2,speed:-0.15}),
    new CardModifier({name:"Glass Cannon",damage:3,MaxHP:-2,reload:10,speed:0.15}),
    new CardModifier({name:"Tough Skin",MaxHP:1,HP:1,reload:5}),
    new CardModifier({name:"Balanced",bullets:0,spread:-0.02,damage:1,reload:5}),

    // Negative / curse modifiers
    new CardModifier({name:"Fragile",MaxHP:-2,HP:-2}),
    new CardModifier({name:"Clumsy",spread:0.2}),
    new CardModifier({name:"Heavy Weight",speed:-0.3}),
    new CardModifier({name:"Broken Barrel",damage:-1,reload:15}),
    new CardModifier({name:"Jam",reload:30}),
    new CardModifier({name:"Reduced Ammo",bullets:-1}),
    new CardModifier({name:"Horde's Call",enemyHP:1,enemiesPerMinute:10}),
    new CardModifier({name:"Glass Shard",MaxHP:-1,damage:-1,speed:-0.1}),
]

function colorGradient(v1,v2,c1,c2,t) {
    if (t <= 0.0001) return c1;
    if (t >= 0.9999) return c2;
    const gradient = ctx.createLinearGradient(v1.x,v1.y,v2.x,v2.y);
    gradient.addColorStop(Math.max(t * 2 - 1,0),c2);
    gradient.addColorStop(Math.min(t,1),c1);
    return gradient;
}

game = new Game();
shadowMan = new ShadowManager();


const zombies = [];
const exp = [];

const traces = [];

// Set dimensions

resizeCanvas()

function resizeCanvas() {
    canvas.width = canvasContainer.getBoundingClientRect().width;
    canvas.height = canvasContainer.getBoundingClientRect().height;
    shadowCanvas.width = canvasContainer.getBoundingClientRect().width;
    shadowCanvas.height = canvasContainer.getBoundingClientRect().height;
    game.center = new Vector(canvas.width,canvas.height).div(2);
}

window.addEventListener("resize",resizeCanvas);

window.addEventListener("mousemove",(e) => game.onMouseMove(e));
window.addEventListener("mousedown",(e) => game.onMouseDown(e));
window.addEventListener("mouseup",(e) => game.onMouseUp(e));

window.addEventListener("keydown",(e) => game.onKeyDown(e));
window.addEventListener("keyup",(e) => game.onKeyUp(e));
window.addEventListener("wheel",(e) => game.onScrollWheel(e),{passive: false})





function gameLoop() {
    // 1. Clear the previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shadowCtx.clearRect(0,0,shadowCanvas.width,shadowCanvas.height);

    ctx.fillStyle = '#172017';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
        game.update();
    } catch (e) {
        console.error(e);
    }
    game.drawBox(false,'rgba(255,255,255,0.1)',game.camera,game.center.mul(new Vector(2)).add(new Vector(5)),0,false,5)
    game.drawBox(false,'rgba(0,0,0,0.2)',game.camera,game.center.mul(new Vector(2)).add(new Vector(5)),0,false,3)
    shadowMan.clearShadows();
    // shadowMan.addShadow(new Vector(100,0),new Vector(0,100))
    // shadowMan.addShadow(new Vector(150,50),new Vector(50,150))
    // shadowMan.addShadow(new Vector(150,300),new Vector(-150,300))



    // zombies.forEach(zomb => {
    //     if (Math.abs(zomb.pos.x - (game.camera.x)) < game.center.x / 2 || Math.abs(zomb.pos.y - (game.camera.y)) > game.center.y / 2) {
    //     }
    // })
    exp.forEach(xp => {
        game.draw(false,imageLibrary["exp"],xp.pos,new Vector(24 + 4*xp.getVel().length(),24 - 0.2 * xp.getVel().length()),xp.getVel().angle())
    })
    zombies.forEach(zomb => {
        if (!game.isOnScreen(zomb.pos)) return;
        game.draw(false,imageLibrary["enemy"],zomb.pos,zomb.size,zomb.rot,true)
        shadowMan.addShadow(zomb.pos.add(zomb.collider.mul(new Vector(-0.4,0.5)).rotate(zomb.rot)), zomb.pos.add(zomb.collider.mul(new Vector(-0.6,0.3)).rotate(zomb.rot)))
        shadowMan.addShadow(zomb.pos.add(zomb.collider.mul(new Vector(-0.6,0.3)).rotate(zomb.rot)), zomb.pos.add(zomb.collider.mul(new Vector(-0.6,-0.3)).rotate(zomb.rot)))
        shadowMan.addShadow(zomb.pos.add(zomb.collider.mul(new Vector(-0.6,-0.3)).rotate(zomb.rot)), zomb.pos.add(zomb.collider.mul(new Vector(-0.4,-0.5)).rotate(zomb.rot)))
            
        if (game.getKey("g")) {
            game.drawCircle(false,'rgba(0,0,0,0.4)',zomb.pos,zomb.collider.length() / 2,2)
            game.drawBox(false,'rgba(0,0,0,0.4)',zomb.pos,zomb.collider,zomb.rot,false,2)
            
        }
    })
    shadowMan.drawShadows();
    traces.forEach(trace => {
        trace.render();
    })
    zombies.forEach(zomb => {
        if (game.isOnScreen(zomb.pos)) {
            if (zomb.HP < zomb.MaxHP || zomb.pos.sub(game.camera).distance(game.getMousePos()) < 40) {
                game.drawBoxFill(false,'rgba(15,40,10,1)',zomb.pos.add(new Vector(0,-40)),new Vector(10*zomb.MaxHP,10))
                const width = 10 - 2;
                for (let i = 0; i < zomb.HP; i++) {
                    const x = (i-zomb.MaxHP/2 + 0.5) * 10;
                    game.drawBoxFill(false,'rgba(100,200,40,1)',zomb.pos.add(new Vector(x,-40)),new Vector(width,6))
                }
            }
        } else {
            const zRelative = zomb.pos.sub(game.camera);
            let pos;
            const size = game.center.sub(16);
            const sizeRatio = size.x/size.y;
            if (Math.abs(zRelative.x) > Math.abs(zRelative.y * sizeRatio)) {
                if (zRelative.x > 0) {
                    pos = new Vector(size.x,size.x * (zRelative.y / zRelative.x))
                } else {
                    pos = new Vector(-size.x,-size.x * (zRelative.y / zRelative.x))
                }
            } else {
                if (zRelative.y > 0) {
                    pos = new Vector(size.y * (zRelative.x / zRelative.y),size.y)
                } else {
                    pos = new Vector(-size.y * (zRelative.x / zRelative.y),-size.y)
                }
            }
            //const pos = Vector.minmax(game.center.mul(-0.5).add(20),zomb.pos.sub(game.camera),game.center.mul(0.5).sub(20));
            //game.drawCircle(true,`rgba(0,255,0,0.1)`,pos,10,2);
            const dist = game.camera.distance(zomb.pos) * game.getScale().x;
            game.drawCircleFill(true,`rgba(0,255,0,0.1)`,pos,6000/dist);
            game.drawCircle(true,`rgba(0,255,0,0.1)`,pos,6000/dist,1);
        }
        
    })
    const playerRot = game.player.pos.sub(game.camera).mul(game.getScale()).angleTo(game.mouse);
    game.draw(false,imageLibrary["arm1"],game.player.pos.add(Vector.fromPolar(15 - 8 * Math.pow(game.player.weaponCooldown / game.player.stats.reload,2),playerRot)),game.player.size.add(0,32),playerRot,true);
    game.draw(false,imageLibrary["arm2"],game.player.pos.add(Vector.fromPolar(15 - 8 * Math.pow(game.player.weaponCooldown / game.player.stats.reload,2),playerRot)),game.player.size.add(0,32),playerRot,true);
    game.draw(false,imageLibrary["gun"],game.player.pos.add(Vector.fromPolar(15 - 5 * Math.pow(game.player.weaponCooldown / game.player.stats.reload,2),playerRot)),game.player.size.add(0,32),playerRot,true);
    game.draw(false,imageLibrary["body"],game.player.pos,game.player.size,playerRot,true);
    game.draw(false,imageLibrary["head"],game.player.pos,game.player.size,game.player.rot,true);

    const hpUnitSize = 40;
    const maxHP = game.player.stats.MaxHP;
    const HP = game.player.stats.HP;
    const expRatio = game.player.stats.experience / game.player.getMaxExperience();

    const width = Math.min(canvas.width * 3/4,maxHP*hpUnitSize) / maxHP;
    game.drawBoxFill(true,'rgb(69, 19, 17)',new Vector(0,canvas.height / 2 - (hpUnitSize/2) - 40),new Vector(maxHP * width, hpUnitSize));
    for (let i = 0; i < HP; i++) {
        const x = (i-maxHP/2 + 0.5) * width;
        game.drawBoxFill(true,'rgb(255, 84, 49)',new Vector(x,canvas.height / 2 - (hpUnitSize/2) - 40),new Vector(width-5,hpUnitSize-5))
    }
    if (game.player.invulnerabilityTicks>0) {
        game.drawBoxFill(true,`rgba(149, 174, 255, ${(game.player.invulnerabilityTicks / 15 - 0.25)})`,new Vector((HP - maxHP/2 + 0.5) * width,canvas.height / 2 - (hpUnitSize/2) - 40),new Vector(width-5,hpUnitSize-5))
    }
    game.drawBoxFill(true,'rgba(0,0,0,0.1)',new Vector(0,canvas.height / 2 - (hpUnitSize * 1/4) - 40),new Vector(maxHP * width, hpUnitSize/2));
    game.drawBoxFill(true,'rgba(255,255,255,0.05)',new Vector(0,canvas.height / 2 - (hpUnitSize * 3/4) - 40),new Vector(maxHP * width, hpUnitSize/2));

    // EXP Rendering
    game.drawBoxFill(true,'rgb(13, 36, 35)',new Vector(0,canvas.height / 2 - (hpUnitSize/2) - 45 - hpUnitSize/2),new Vector(maxHP * width, 10));
    game.drawBoxFill(true,'rgb(79, 226, 219)',new Vector(0,canvas.height / 2 - (hpUnitSize/2) - 45 - hpUnitSize/2),new Vector((maxHP * width) * expRatio, 8));
    game.drawBoxFill(true,'rgba(0, 0, 0, 0.13)',new Vector(0,canvas.height / 2 - (hpUnitSize/2) - 43 - hpUnitSize/2),new Vector((maxHP * width) * expRatio, 4));

    if (game.mode == "upgrade") {
        game.drawBoxFill(true,'rgba(0,0,0,0.75)',new Vector(),game.center.mul(2))
        game.cards.forEach(card => card.render());
    }
    const stats = game.player.stats;
    let i = 1;
    for (const key in stats) {
        if (key == "maxExperience" || key == "experience") continue;
        let val = stats[key];
        if (key == "reload") {
            val = `${Math.round(val/60 * 100)/100}s`
        }

        game.drawTextFill(true,`${key.charAt(0).toUpperCase() + key.slice(1)}: ${val}`,`rgba(255,255,255,1)`,`18px monospaced`,game.center.sub(new Vector(5,i * 20)),"right","top",0)
        i++;
    }
    
    // 2. Update object positions (e.g., player.x += player.speed)
    //update();

    // 3. Draw objects to the canvas
    //draw();

    // 4. Call the loop again for the next frame
    requestAnimationFrame(gameLoop);
}

gameLoop();