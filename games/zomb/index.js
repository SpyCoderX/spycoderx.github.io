/*
  # Todo
  - Add EXP
  - Add constrollable reload time, bullets per shoot, shoot range, movement speed, damage, max HP, hp.
  - Add randomized upgrades
  - Add gun
  - Add shadow, going away from player
  - Make it night w/ shadow going from zombies to edge, light from player.
  - Create gravestones n dirt n stuff.
*/

const canvas = document.getElementById('gameCanvas');
const canvasContainer = document.getElementsByClassName('canvas-container')[0];
const ctx = canvas.getContext('2d'); // This is your drawing tool
const imageList = ["player.svg","enemy.svg"]

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
}
class Zombie {
    pos = new Vector();
    vel = new Vector();
    size = new Vector(60);
    collider = new Vector(25,50);
    rot = 0;
    HP;
    MaxHP = 5;
    constructor(_pos) {
        this.pos = _pos.copy();
        this.HP = this.MaxHP;
    }
    damage(n,src,force=3) {
        this.HP -= n;
        this.vel.addMe(this.pos.sub(src).normalize().mul(force));
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
        if (this.ticks%30 == 0) {
            zombies.push(new Zombie(this.player.pos.add(Vector.fromPolar(600,Math.random()*Math.PI*2))))
        }
        this.camera.mulMe(0.9);
        this.camera.addMe(this.player.pos.mul(0.1));
        this.followMouse.mulMe(0.8);
        this.followMouse.addMe(this.mouse.mul(0.2));

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
                zombies.splice(i,1);
                i--;
            } else {
                if (zomb.pos.distance(this.player.pos) < (zomb.collider.length()) / 2) {
                    this.player.damage(1);
                }
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
            for (let i = 0; i < 7; i++) {
                const start = this.player.pos;
                const max = Vector.fromPolar(1200,new Vector().angleTo(this.getMousePos()) + (Math.random() - 0.5)*0.5).add(this.player.pos);
                const {pos:end,entity:hit} = this.rayTraceEnemies(start,max);
                if (hit != null) {
                    hit.damage(1,this.player.pos)
                }
                const trace = new Trace(start,end,this.player.vel);
                traces.push(trace)
            }
            this.player.weaponCooldown = 30;
        }
        if (this.player.weaponCooldown > 0) {
            this.player.weaponCooldown -= 1;
        }
        if (this.player.invulnerabilityTicks > 0) {
            this.player.invulnerabilityTicks -= 1;
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
        const offset = this.center.div(2).add(location).sub(this.camera);
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
        const offset = this.center.div(2).add(location).sub(this.camera);
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
        const offset = this.center.div(2).add(location).sub(this.camera);
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
        ctx.lineWidth = width;
        const pos = this.center.div(2).add(c).sub(this.camera);
        if (isUI) pos.addMe(this.camera);
        ctx.beginPath();
        ctx.arc(pos.x,pos.y,radius,0,Math.PI*2);
        ctx.stroke();
    }
     drawCircleFill(isUI,color,c,radius,width=1) {
        ctx.fillStyle = color;
        const pos = this.center.div(2).add(c).sub(this.camera);
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
        const offsetStart = this.center.div(2).add(start).sub(this.camera);
        const offsetEnd = this.center.div(2).add(end).sub(this.camera);
        ctx.beginPath();
        ctx.moveTo(offsetStart.x,offsetStart.y);
        ctx.lineTo(offsetEnd.x,offsetEnd.y);
        ctx.stroke();
    }
    drawLongLine(isUI,color,points,width=1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        const offsetStart = this.center.div(2).add(points[0]).sub(this.camera);
        if (isUI) offsetStart.addMe(this.camera);
        ctx.beginPath();
        ctx.moveTo(offsetStart.x,offsetStart.y);
        for (let i = 1; i < points.length; i++) {
            const point = this.center.div(2).add(points[i]).sub(this.camera);
            if (isUI) point.addMe(this.camera);
            ctx.lineTo(point.x,point.y);
        }
        ctx.stroke();
    }

    onMouseMove(event) {
        const rect = canvas.getBoundingClientRect();

        this.mouse.setMe(
            new Vector(
                event.clientX - rect.left - this.center.x / 2,
                event.clientY - rect.top - this.center.y / 2
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

game = new Game();


const zombies = [];


const traces = [];

// Set dimensions

resizeCanvas()

function resizeCanvas() {
    canvas.width = canvasContainer.getBoundingClientRect().width;
    canvas.height = canvasContainer.getBoundingClientRect().height;
    game.center = new Vector(canvas.width,canvas.height);
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

    ctx.fillStyle = '#2e3b2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
        game.update();
    } catch (e) {
        console.error(e);
    }
    zombies.forEach(zomb => {
        if (Math.abs(zomb.pos.x - (game.camera.x)) > game.center.x / 2 || Math.abs(zomb.pos.y - (game.camera.y)) > game.center.y / 2) {
            const pos = Vector.minmax(game.center.mul(-0.5).add(20),zomb.pos.sub(game.camera),game.center.mul(0.5).sub(20));
            //game.drawCircle(true,`rgba(0,255,0,0.1)`,pos,10,2);
            const dist = game.camera.distance(zomb.pos);
            game.drawCircleFill(true,`rgba(0,255,0,0.1)`,pos,6000/dist);
            game.drawCircle(true,`rgba(0,255,0,0.1)`,pos,6000/dist,1);

            
        } else {
            game.draw(false,imageLibrary["enemy"],zomb.pos,zomb.size,zomb.rot,true)
        }
        if (game.getKey("g")) {
            game.drawCircle(false,'rgba(0,0,0,0.4)',zomb.pos,zomb.collider.length() / 2,2)
            game.drawBox(false,'rgba(0,0,0,0.4)',zomb.pos,zomb.collider,zomb.rot,false,2)

        }
    })
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
    game.draw(false,imageLibrary["player"],game.player.pos,game.player.size,game.player.rot,true);
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

    
    // 2. Update object positions (e.g., player.x += player.speed)
    //update();

    // 3. Draw objects to the canvas
    //draw();

    // 4. Call the loop again for the next frame
    requestAnimationFrame(gameLoop);
}

gameLoop();