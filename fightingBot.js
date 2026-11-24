const WebSockets = require("ws")
const { getGameFromId, parsePacket0, vector2 } = require("./utils.js")


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class fightingBot
{
    constructor(gameLink, shipToAttackId)
    {
        this.name = "Starblast.site"
        this.isShooting = false
        this.isWatching = false
        this.isThrusting = false
        this.opponentId = shipToAttackId
        this.hue = 36
        this.intervall
        this.shootSpeed = 200
        this.updateBotTime = 100
        this.message

        this.botData =
        {
            x : 0,
            y : 0,
            id : null,
            speedX : 0,
            speedY : 0,
            energy : 0,
            canShoot : false,
            angularVelocity : 0,
            angle : 0
        }

        this.opponentData =
        {
            x : 0,
            y : 0,
            id : null,
            speedX : 0,
            speedY : 0,
            energy : 0,
            canShoot : false
        }

        this.gameLink = gameLink
        this.socket
    }

    start()
    {
        this.joinGame()
    }

    async joinGame()
    {
        this.gameInfo = await getGameFromId(this.gameLink)

        this.socket = new WebSockets(
            this.gameInfo.wsUrl,
            {
                headers :
                {
                    Origin : "https://starblast.io/"
                }
            }
        )

        this.socket.on("open", () =>
        {
            this.socket.send(JSON.stringify(
                {
                    name : "ojct:4",
                    data :
                    {
                        mode : "survival",
                        player_name : this.name,
                        hue : this.hue,
                        ecp_key : this.ecpKey,
                        ecp_custom : this.ecpCustom,
                        preferred : this.gameInfo.id,
                        spectate : false
                    }
                }
            ))
        })

        this.socket.on("close", (code, reason) =>
        {
            console.log("close", code)
        })

        this.socket.on("message", (message) =>
        {
            let msg

            this.dataManager(message)

            try
            {
                msg = JSON.parse(message)
            }
            catch(error)
            {
                return
            }

            if(msg.name === "welcome")
            {
                this.socket.send(JSON.stringify(
                    {
                        name : "enter",
                        data :
                        {
                            spectate : true
                        }
                    }
                ))

                this.socket.send(JSON.stringify(
                    {
                        name : "respawn"
                    }
                ))
            }

            if(msg.name === "entered")
            {
                this.botData.id = msg.data.shipid

                if(!this.intervall)
                {
                    this.intervall = setInterval(() =>
                    {
                        this.botManager()
                    }, this.updateBotTime)
                }
            }
        })
    }

    dataManager(msg)
    {
        const array = Array.from(msg)

        if(array[0] === 0)
        {
            const msgData = parsePacket0(array)

            if(msgData.shipId === this.botData.id)
            {
                this.botData.x = msgData.x
                this.botData.y = msgData.y
                this.botData.speedX = msgData.speedX
                this.botData.speedY = msgData.speedY
                this.botData.energy = msgData.energy
                this.botData.canShoot = msgData.energy > 85
                this.botData.angularVelocity = msgData.angularVelocity
            }
            else if(msgData.shipId === this.opponentId)
            {
                this.opponentData.x = msgData.x
                this.opponentData.y = msgData.y
                this.opponentData.speedX = msgData.speedX
                this.opponentData.speedY = msgData.speedY
                this.opponentData.energy = msgData.energy
                this.opponentData.canShoot = msgData.energy > 85
                this.opponentData.angle = msgData.angle
            }
        }
    }

    botManager()
    {
        const closeDistance = 20
        const farDistance = 45
        const distance = this.getDistance()

        if(distance <= closeDistance)
        {
            this.shootOnOpponent()
            this.watchOpposite()
            this.thrust()
        }
        else if(distance >= farDistance)
        {
            console.log("opponent is too far go see him")
            this.watchOpponent()
            this.thrust()
            this.shootOnOpponent()
        }
        else
        {
            this.watchOpponent()
            this.shootOnOpponent()
        }
    }

    async thrust()
    {
        const angle = this.botData.angle

        if(angle >= 360 || this.isThrusting === true)
        {
            return
        }

        this.isThrusting = true

        this.socket.send(4096 + angle)

        await sleep(100)

        this.socket.send(angle)

        this.isThrusting = false
    }

    watchOpponent()
    {
        const distance = this.getDistance()

        console.log(
            "SpeedPlayer , X :",
            this.opponentData.speedX,
            "y : ",
            this.opponentData.speedY
        )

        this.predictedOpponentPosition =
        {
            x :
                this.opponentData.x +
                this.opponentData.speedX *
                (this.updateBotTime / (50 / 3)),

            y :
                this.opponentData.y +
                this.opponentData.speedY *
                (this.updateBotTime / (50 / 3))
        }

        console.log(
            "Predicted , X :",
            this.predictedOpponentPosition.x,
            "y : ",
            this.predictedOpponentPosition.y
        )

        const angleRad = Math.atan2(
            this.predictedOpponentPosition.y - this.botData.y,
            this.predictedOpponentPosition.x - this.botData.x
        )

        let angleDegree = (angleRad * 180) / Math.PI

        if(angleDegree < 0)
        {
            angleDegree += 360
        }

        this.botData.angle = Math.round(angleDegree)

        this.socket.send(Math.round(angleDegree))
    }

    watchOpposite()
    {
        const angleRad = Math.atan2(
            this.opponentData.y - this.botData.y,
            this.opponentData.x - this.botData.x
        )

        let angleDegree = (angleRad * 180) / Math.PI
        let offset = 0

        if(angleDegree < 0)
        {
            angleDegree += 360
        }

        if(this.botData.angularVelocity < 0)
        {
            offset = 0
        }
        else if(this.botData.angularVelocity > 0)
        {
            offset = 0
        }
        else
        {
            offset = 0
        }

        let finalAngle = (angleDegree + offset) - 180

        finalAngle = ((finalAngle % 360) + 360) % 360

        this.botData.angle = Math.round(finalAngle)

        this.socket.send(Math.round(finalAngle))
    }

    shootOnOpponent()
    {
        const tickDuration = 50 / 3
        const distance = this.getDistance()

        /*
         * shootSpeed = vitesse du laser en unités/seconde.
         *
         * Conversion en unités par tick :
         * 200 × (16,67 / 1000) ≈ 3,33 unités/tick.
         */
        const laserSpeedPerTick =
            this.shootSpeed * (tickDuration / 1000)

        /*
         * Nombre de ticks que met le laser pour parcourir
         * la distance entre le bot et le joueur.
         */
        const shootTimeTicks =
            distance / laserSpeedPerTick

        /*
         * 100 ms entre deux exécutions du bot correspondent
         * à environ 6 ticks.
         */
        const updateTimeTicks =
            this.updateBotTime / tickDuration

        const predictionTicks =
            updateTimeTicks + shootTimeTicks

        console.log(
            "Unpredicted , X :",
            this.opponentData.x,
            "y : ",
            this.opponentData.y
        )

        this.predictedOpponentPosition =
        {
            x :
                this.opponentData.x +
                this.opponentData.speedX * predictionTicks,

            y :
                this.opponentData.y +
                this.opponentData.speedY * predictionTicks
        }

        console.log(
            "Predicted , X :",
            this.predictedOpponentPosition.x,
            "y : ",
            this.predictedOpponentPosition.y,
            "distance :",
            distance,
            "laser speed/tick :",
            laserSpeedPerTick,
            "shoot ticks :",
            shootTimeTicks,
            "total ticks :",
            predictionTicks
        )

        const angleRad = Math.atan2(
            this.predictedOpponentPosition.y - this.botData.y,
            this.predictedOpponentPosition.x - this.botData.x
        )

        let angleDegree = (angleRad * 180) / Math.PI

        if(angleDegree < 0)
        {
            angleDegree += 360
        }

        this.shoot(Math.round(angleDegree))
    }

    async shoot(angle)
    {
        console.log(this.lookOponentAmount())

        if(angle >= 0 && angle < 360)
        {
            if(this.botData.energy > 100 && this.isShooting === false)
            {
                this.isShooting = true

                this.socket.send(8192 + angle)

                await sleep(100)

                this.socket.send(angle)

                this.isShooting = false
            }
            else
            {
                return
            }
        }
        else
        {
            return
        }
    }

    getDistance()
    {
        const directionnalVector =
        {
            x : this.opponentData.x - this.botData.x,
            y : this.opponentData.y - this.botData.y
        }

        return Math.sqrt(
            directionnalVector.x ** 2 +
            directionnalVector.y ** 2
        )
    }

    lookOponentAmount()
    {
        const botVector =
        {
            x : this.botData.x,
            y : this.botData.y
        }

        const opponentVector =
        {
            x : this.opponentData.x,
            y : this.opponentData.y
        }

        const normalizedBotVector =
            this.normalize(botVector)

        const normalizedOpponentVector =
            this.normalize(opponentVector)

        const dotProduct =
            this.dotProduct(
                normalizedBotVector,
                normalizedOpponentVector
            )

        return dotProduct
    }

    dotProduct(vector1, vector2)
    {
        return (
            vector1.x * vector2.x +
            vector1.y * vector2.y
        )
    }

    normalize(vector)
    {
        return {
            x :
                vector.x /
                Math.sqrt(vector.x ** 2 + vector.y ** 2),

            y :
                vector.y /
                Math.sqrt(vector.x ** 2 + vector.y ** 2)
        }
    }
}

module.exports = { fightingBot }