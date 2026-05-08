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
}

class Trace {
    points = [];
    vels = [];
    age = 1;
    maxLifetime = 30;
    constructor(_start,_end,_spacing=35,_initialMovement=0) {
        const dist = new Vector(_start).distance(_end);
        for (let i = 0; i < 1; i += _spacing/dist) {
            const pos = new Vector(_start).mul(1-i).add(new Vector(_end).mul(i))
            this.points.push(pos);
            this.vels.push(Vector.randomOnCircle());

        }
        this.points.push(_end.copy());
        this.vels.push(Vector.randomOnCircle());
        for (let i = 0; i < _initialMovement; i++) {
            this.move();
        }
    }
    move() {
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const v = this.vels[i];
            p.addMe(v.mul(5 / this.age + 0.4).mul(0.3));
        }
    }
    tick() {
        this.move();
        this.age += 1;
    }
    render() {
        game.drawLongLine(`rgba(250,220,110,${1 / (this.age) - (this.age / (this.maxLifetime*this.maxLifetime))})`,this.points,1.8 / this.age + 0.6);
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
}
class Zombie {
    pos = new Vector();
    size = new Vector(60);
    collider = new Vector(25,50);
    rot = 0;
    HP;
    MaxHP = 2;
    constructor(_pos) {
        this.pos = _pos.copy();
        this.HP = this.MaxHP;
    }
    damage(n) {
        this.HP -= n;
    }
}

class Game {
    center = new Vector();
    camera = new Vector();
    mouse = new Vector();
    followMouse = new Vector();
    player = new Player();
    keys = {};
    ticks = 0;
    mouseAction = "none";

    getSmoothMousePos() {
        return this.followMouse.add(this.camera.sub(this.player.pos));
    }
    getMousePos() {
        return this.mouse.add(this.camera.sub(this.player.pos));
    }

    update() {
        if (this.getKey("mouse") == true) {
            if (this.mouseAction == "none") {
                this.mouseAction = "press";
            }
            else if (this.mouseAction == "press") {
                this.mouseAction = "hold";
            } 
        } else {
            if (this.mouseAction == "release") {
                this.mouseAction = "none";
            }
            else if (this.mouseAction == "press" || this.mouseAction == "hold") {
                this.mouseAction = "release";
            }
        }
        this.ticks += 1;
        if (this.ticks%30 == 0) {
            zombies.push(new Zombie(this.player.pos.add(Vector.fromPolar(600,Math.random()*Math.PI*2))))
        }
        this.camera.mulMe(0.9);
        this.camera.addMe(this.player.pos.mul(0.1));
        this.followMouse.mulMe(0.8);
        this.followMouse.addMe(this.mouse.mul(0.2));

        this.player.inputMap = new Vector(this.getKey("d") - this.getKey("a"), this.getKey("s") - this.getKey("w"));
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
            zomb.pos.addMe(Vector.fromPolar(2,zomb.rot))
            if (zomb.HP <= 0) {
                zombies.splice(i,1);
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
        if ((this.mouseAction == "press" || this.mouseAction == "hold") && this.player.weaponCooldown == 0) {
            //bullets.push(new Bullet(this.player.pos,this.player.rot));
            for (let i = 0; i < 1; i++) {
                const start = this.player.pos;
                const max = Vector.fromPolar(1000,new Vector().angleTo(this.getMousePos()) + (Math.random() - 0.5)*0.05).add(this.player.pos);
                const {pos:end,entity:hit} = this.rayTraceEnemies(start,max);
                if (hit != null) {
                    hit.damage(1)
                }
                const trace = new Trace(start,end);
                traces.push(trace)
            }
            this.player.weaponCooldown = 10;
        }
        if (this.player.weaponCooldown > 0) {
            this.player.weaponCooldown -= 1;
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

    getKey(key) {
        return this.keys[key] ?? false;
    }


    draw(image,location,size,rot=0,upwards=false) {
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

    drawBox(color,location,size,rot=0,upwards=false,width=1) {
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
    drawBoxFill(color,location,size,rot=0,upwards=false,width=1) {
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
    drawCircle(color,c,radius,width=1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        const pos = this.center.div(2).add(c).sub(this.camera);
        ctx.beginPath();
        ctx.arc(pos.x,pos.y,radius,0,Math.PI*2);
        ctx.stroke();
    }
    drawLine(color,start,end,width=1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        const offsetStart = this.center.div(2).add(start).sub(this.camera);
        const offsetEnd = this.center.div(2).add(end).sub(this.camera);
        ctx.beginPath();
        ctx.moveTo(offsetStart.x,offsetStart.y);
        ctx.lineTo(offsetEnd.x,offsetEnd.y);
        ctx.stroke();
    }
    drawLongLine(color,points,width=1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        const offsetStart = this.center.div(2).add(points[0]).sub(this.camera);
        ctx.beginPath();
        ctx.moveTo(offsetStart.x,offsetStart.y);
        for (let i = 1; i < points.length; i++) {
            const point = this.center.div(2).add(points[i]).sub(this.camera);
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
        this.keys[event.key] = true;
    }
    onKeyUp(event) {
        this.keys[event.key] = false;
    }
    onMouseDown(event) {
        this.keys["mouse"] = true;
    }
    onMouseUp(event) {
        this.keys["mouse"] = false;
    }
}

game = new Game();


const zombies = [];
for (let i = 0; i < 10; i++) {
    zombies.push(new Zombie(Vector.fromPolar(600,Math.random()*Math.PI*2)))
}

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
        game.draw(imageLibrary["enemy"],zomb.pos,zomb.size,zomb.rot,true)
    })
    traces.forEach(trace => {
        trace.render();
    })
    zombies.forEach(zomb => {
        game.drawBoxFill('rgba(15,40,10,1)',zomb.pos.add(new Vector(0,-40)),new Vector(10*zomb.MaxHP,10))
        const width = 10 - 2;
        for (let i = 0; i < zomb.HP; i++) {
            const x = (i-zomb.MaxHP/2 + 0.5) * 10;
            game.drawBoxFill('rgba(100,200,40,1)',zomb.pos.add(new Vector(x,-40)),new Vector(width,6))
        }
    })
    game.draw(imageLibrary["player"],game.player.pos,game.player.size,game.player.rot,true);

    // 2. Update object positions (e.g., player.x += player.speed)
    //update();

    // 3. Draw objects to the canvas
    //draw();

    // 4. Call the loop again for the next frame
    requestAnimationFrame(gameLoop);
}

gameLoop();