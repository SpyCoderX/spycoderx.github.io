

const canvas = document.getElementById('gameCanvas');
const canvasContainer = document.getElementsByClassName('canvas-container')[0];
const ctx = canvas.getContext('2d'); // This is your drawing tool
const shadowCanvas = document.createElement("canvas");
const shadowCtx = shadowCanvas.getContext('2d'); // This is your drawing tool
const imageList = ["head.svg","body.svg","enemy.svg","exp.svg","gun.svg"]

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
            game.drawLongLine(false,`rgba(250,220,150,0.2)`,[this.points[0],this.points[this.points.length-1]],3 / (this.age / 2)**2);
            game.drawLongLine(false,`rgba(250,220,150,0.2)`,[this.points[0],this.points[this.points.length-1]],2 / (this.age / 2)**2);
        }
        game.drawLongLine(false,`rgba(255,255,255,${1 / (this.age) - (this.age / (this.maxLifetime*this.maxLifetime))})`,this.points,1.3 / this.age + 0.6);
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
    HP;
    MaxHP = 20;
    invulnerabilityTicks = 0;
    experience = 0;
    maxExperience = 20;
    level = 0;
    bullets = 1;
    constructor() {
        this.HP = this.MaxHP;
    }
    damage(n) {
        if (this.invulnerabilityTicks > 0){
            return;
        }
        this.HP -= n;
        this.invulnerabilityTicks = 20;
    }
    getMaxExperience() {
        return this.maxExperience;
    }
}
class Zombie {
    pos = new Vector();
    vel = new Vector();
    size = new Vector(60).mul(1+(game.enemyHP-2)/8);
    collider = new Vector(25,50).mul(1+(game.enemyHP-2)/8);
    rot = 0;
    HP;
    MaxHP = game.enemyHP;
    constructor(_pos) {
        this.pos = _pos.copy();
        this.HP = this.MaxHP;
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

    getSmoothMousePos() {
        return this.followMouse.add(this.camera.sub(this.player.pos));
    }
    getMousePos() {
        return this.mouse.add(this.camera.sub(this.player.pos));
    }

    restart() {
        this.player = new Player();
        zombies.length = 0; // Seems weird, but JS jank ig?
        traces.length = 0;
        this.enemyPerMinute = 60;
        this.enemyHP = 2;
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
        this.player.vel.addMe(this.player.inputMap);
        this.player.vel.mulMe(0.8);
        this.player.pos.addMe(this.player.vel);

        

        this.player.rot = Math.atan2(
            this.getSmoothMousePos().y,
            this.getSmoothMousePos().x
        )
        
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
                game.player.experience += 1;
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
            for (let i = 0; i < this.player.bullets; i++) {
                const start = this.player.pos.add(new Vector(39,7).rotate(this.player.rot));
                const max = Vector.fromPolar(1200,new Vector().angleTo(this.getMousePos()) + (Math.random() - 0.5)*0.05 * this.player.bullets).add(start);
                const {pos:end,entity:hit} = this.rayTraceEnemies(start,max);
                if (hit != null) {
                    hit.damage(1,this.player.pos)
                }
                const trace = new Trace(start,end,this.player.vel);
                traces.push(trace)
            }
            this.player.weaponCooldown = 10;
        }
        if (this.player.weaponCooldown > 0) {
            this.player.weaponCooldown -= 1;
        }
        if (this.player.invulnerabilityTicks > 0) {
            this.player.invulnerabilityTicks -= 1;
        }
        if (this.player.experience >= this.player.maxExperience) {
            this.player.experience -= this.player.maxExperience;
            this.player.level += 1;
            this.player.bullets += 1;
            this.enemyPerMinute *= 1.2;
            this.enemyHP += 1;
            this.player.maxExperience += 10;
        }
        if (this.player.HP <= 0) {
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

    


    draw(isUI,image,location,size,rot=0,upwards=false) {
        if (isUI) location = location.add(this.camera);
        if (image.complete && image.naturalWidth == 0) {
            this.drawBox('red',location,size,rot,upwards);
            return;
        }
        ctx.save();
        const offset = this.center.add(location).sub(this.camera);
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

    drawBox(isUI,color,location,size,rot=0,upwards=false,width=1) {
        if (isUI) location = location.add(this.camera);
        ctx.save();
        const offset = this.center.add(location).sub(this.camera);
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
    drawBoxFill(isUI,color,location,size,rot=0,upwards=false,width=1) {
        if (isUI) location = location.add(this.camera);
        ctx.save();
        const offset = this.center.add(location).sub(this.camera);
        ctx.translate(offset.x,offset.y);
        if (upwards) {
            ctx.rotate(rot+Math.PI/2);
        } else {
            ctx.rotate(rot);
        }
        const halfSize = size.div(2);
        ctx.fillStyle = color;
        ctx.lineWidth = width;
        ctx.fillRect(-halfSize.x,-halfSize.y,size.x,size.y);
        ctx.restore();
    }
    drawCircle(isUI,color,c,radius,width=1) {
        ctx.strokeStyle = color;
        ctx.fillStyle = '';
        ctx.lineWidth = width;
        const pos = this.center.add(c).sub(this.camera);
        if (isUI) pos.addMe(this.camera);
        ctx.beginPath();
        ctx.arc(pos.x,pos.y,radius,0,Math.PI*2);
        ctx.stroke();
    }
     drawCircleFill(isUI,color,c,radius,width=1) {
        ctx.fillStyle = color;
        ctx.strokeStyle = '';
        const pos = this.center.add(c).sub(this.camera);
        if (isUI) pos.addMe(this.camera);
        ctx.beginPath();
        ctx.arc(pos.x,pos.y,radius,0,Math.PI*2);
        ctx.fill();
    }
    drawLine(isUI,color,start,end,width=1) {
        if (isUI) start = start.add(this.camera);
        if (isUI) end = end.add(this.camera);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        const offsetStart = this.center.add(start).sub(this.camera);
        const offsetEnd = this.center.add(end).sub(this.camera);
        ctx.beginPath();
        ctx.moveTo(offsetStart.x,offsetStart.y);
        ctx.lineTo(offsetEnd.x,offsetEnd.y);
        ctx.stroke();
    }
    drawLongLine(isUI,color,points,width=1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        const offsetStart = this.center.add(points[0]).sub(this.camera);
        if (isUI) offsetStart.addMe(this.camera);
        ctx.beginPath();
        ctx.moveTo(offsetStart.x,offsetStart.y);
        for (let i = 1; i < points.length; i++) {
            const point = this.center.add(points[i]).sub(this.camera);
            if (isUI) point.addMe(this.camera);
            ctx.lineTo(point.x,point.y);
        }
        ctx.stroke();
    }

    onMouseMove(event) {
        const rect = canvas.getBoundingClientRect();

        this.mouse.setMe(
            new Vector(
                event.clientX - rect.left - this.center.x,
                event.clientY - rect.top - this.center.y
            )
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
}

class ShadowManager {
    shadows = []
    addShadow(p1,p2) {
        this.shadows.push(new Shadow(p1,p2))
    }
    drawShadows() {
        const points = [];
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
        const p0 = game.center.add(points[0]).sub(game.camera);
        shadowCtx.moveTo(p0.x,p0.y)
        for (let i = 1; i < points.length; i++) {
            const p = game.center.add(points[i]).sub(game.camera);
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
        if (Math.abs(zomb.pos.x - (game.camera.x)) > game.center.x || Math.abs(zomb.pos.y - (game.camera.y)) > game.center.y) {
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
            const dist = game.camera.distance(zomb.pos);
            game.drawCircleFill(true,`rgba(0,255,0,0.1)`,pos,6000/dist);
            game.drawCircle(true,`rgba(0,255,0,0.1)`,pos,6000/dist,1);
            
            
        } else {
            game.draw(false,imageLibrary["enemy"],zomb.pos,zomb.size,zomb.rot,true)
            shadowMan.addShadow(zomb.pos.add(zomb.collider.mul(new Vector(-0.4,0.5)).rotate(zomb.rot)), zomb.pos.add(zomb.collider.mul(new Vector(-0.6,0.3)).rotate(zomb.rot)))
            shadowMan.addShadow(zomb.pos.add(zomb.collider.mul(new Vector(-0.6,0.3)).rotate(zomb.rot)), zomb.pos.add(zomb.collider.mul(new Vector(-0.6,-0.3)).rotate(zomb.rot)))
            shadowMan.addShadow(zomb.pos.add(zomb.collider.mul(new Vector(-0.6,-0.3)).rotate(zomb.rot)), zomb.pos.add(zomb.collider.mul(new Vector(-0.4,-0.5)).rotate(zomb.rot)))
            
        }
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
        if (zomb.HP < zomb.MaxHP || zomb.pos.sub(game.camera).distance(game.mouse) < 40) {
            game.drawBoxFill(false,'rgba(15,40,10,1)',zomb.pos.add(new Vector(0,-40)),new Vector(10*zomb.MaxHP,10))
            const width = 10 - 2;
            for (let i = 0; i < zomb.HP; i++) {
                const x = (i-zomb.MaxHP/2 + 0.5) * 10;
                game.drawBoxFill(false,'rgba(100,200,40,1)',zomb.pos.add(new Vector(x,-40)),new Vector(width,6))
            }
        }
    })
    game.draw(false,imageLibrary["gun"],game.player.pos.add(Vector.fromPolar(15,game.mouse.angle())),game.player.size.add(0,32),game.mouse.angle(),true);
    game.draw(false,imageLibrary["body"],game.player.pos,game.player.size,game.mouse.angle(),true);
    game.draw(false,imageLibrary["head"],game.player.pos,game.player.size,game.player.rot,true);

    const hpUnitSize = 40;
    const width = Math.min(canvas.width * 3/4,game.player.MaxHP*hpUnitSize) / game.player.MaxHP;
    game.drawBoxFill(true,'rgb(69, 19, 17)',new Vector(0,canvas.height / 2 - (hpUnitSize/2) - 40),new Vector(game.player.MaxHP * width, hpUnitSize));
    for (let i = 0; i < game.player.HP; i++) {
        const x = (i-game.player.MaxHP/2 + 0.5) * width;
        game.drawBoxFill(true,'rgb(255, 84, 49)',new Vector(x,canvas.height / 2 - (hpUnitSize/2) - 40),new Vector(width-5,hpUnitSize-5))
    }
    if (game.player.invulnerabilityTicks>0) {
        game.drawBoxFill(true,`rgba(149, 174, 255, ${(game.player.invulnerabilityTicks / 15 - 0.25)})`,new Vector((game.player.HP - game.player.MaxHP/2 + 0.5) * width,canvas.height / 2 - (hpUnitSize/2) - 40),new Vector(width-5,hpUnitSize-5))
    }
    game.drawBoxFill(true,'rgba(0,0,0,0.1)',new Vector(0,canvas.height / 2 - (hpUnitSize * 1/4) - 40),new Vector(game.player.MaxHP * width, hpUnitSize/2));
    game.drawBoxFill(true,'rgba(255,255,255,0.05)',new Vector(0,canvas.height / 2 - (hpUnitSize * 3/4) - 40),new Vector(game.player.MaxHP * width, hpUnitSize/2));

    // EXP Rendering
    game.drawBoxFill(true,'rgb(13, 36, 35)',new Vector(0,canvas.height / 2 - (hpUnitSize/2) - 45 - hpUnitSize/2),new Vector(game.player.MaxHP * width, 10));
    game.drawBoxFill(true,'rgb(79, 226, 219)',new Vector(0,canvas.height / 2 - (hpUnitSize/2) - 45 - hpUnitSize/2),new Vector((game.player.MaxHP * width) * game.player.experience / game.player.getMaxExperience(), 8));
    game.drawBoxFill(true,'rgba(0, 0, 0, 0.13)',new Vector(0,canvas.height / 2 - (hpUnitSize/2) - 43 - hpUnitSize/2),new Vector((game.player.MaxHP * width) * game.player.experience / game.player.getMaxExperience(), 4));


    
    // 2. Update object positions (e.g., player.x += player.speed)
    //update();

    // 3. Draw objects to the canvas
    //draw();

    // 4. Call the loop again for the next frame
    requestAnimationFrame(gameLoop);
}

gameLoop();