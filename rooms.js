const WebSockets = require("ws")
const { Tracker } = require("./tracker.js")
const { BrowserClient} = require("starblast-modding")
const { fightingBot } = require("./fightingBot.js")
const { parsePacket0, parsePacket101, parsePacket150 } = require("./utils.js")
const path = require("path")

class Room
{
    constructor(players, ecpKey, duelAgainstBot, onData)
    {
        this.spawningShipIdx = 0
        this.trackers = []
        this.players = players
        this.ecpKey = ecpKey
        this.onData = onData
        this.duelAgainstBot = duelAgainstBot
        this.fightBot
        this.game
        this.gameId
        this.link
    }

    async createModdingGame()
    {
        return new Promise((resolve, reject) =>
        {
            this.mod = new BrowserClient(
                {
                    cacheECPKey : false,
                    cacheOptions : false
                }
            )
            this.mod.setRegion("Europe")
            if(this.ecpKey === null)
            {
                reject("no_ecp_key")
            }
            this.mod.setECPKey(this.ecpKey)
            this.mod.loadCodeFromLocal(
                path.join(__dirname, "duelModeCode.js"),
                {
                    watchChanges : false,
                    watchInterval : 50000,
                    executionTimeout : false
                }
            )
            this.mod.start()
            this.game = this.mod.getNode()

            this.game.on("start", async (link, options) =>
            {
                this.link = link
                this.trackGameData(this.link)
                
                this.gameId = this.link.split("#")[1]
                this.gameId = this.gameId.split("@")[0]

                this.players[this.spawningShipIdx].socket.send(JSON.stringify(
                {
                    name : "room_created",
                    data : this.gameId,
                    link : this.link
                })
                )
                if(this.fightBot === false)
                {
                    this.players[this.spawningShipIdx+1].socket.send(JSON.stringify(
                    {
                        name : "wait_other_one"
                    })
                    )
                }
                resolve()
            })

            this.game.on("shipSpawn", (ship) =>
            {
                if(this.duelAgainstBot === true)
                {
                    this.players[this.spawningShipIdx].playerGameInfo.shipId = ship.id
                    if(!this.fightBot)
                    {
                        this.fightBot = new fightingBot(this.link, this.players[0].playerGameInfo.shipId) 
                        this.fightBot.start()
                    }

                }
                else
                {
                    if(this.spawningShipIdx >= this.players.length)
                    {
                        return
                    }
                    this.players[this.spawningShipIdx].playerGameInfo.shipId = ship.id
                    this.spawningShipIdx += 1
                    if(this.spawningShipIdx < this.players.length)
                    {
                        this.players[this.spawningShipIdx].socket.send(JSON.stringify(
                        {
                            name : "room_created",
                            data : this.gameId,
                            link : this.link
                        })
                        )
                        
                    }
                }


            })

            this.game.on("stop", () =>
            {
                this.stopMod()
            })

            this.game.on("error", () =>
            {
                this.stopMod()
            })

            this.game.on("shipDisconnect", () =>
            {
               this.stopMod() 
            })

            this.game.on("stop", () =>
            {
               this.stopMod() 
            })
        })
    }

    trackGameData(gameLink)
    {
        this.trackers.push(new Tracker(gameLink, (msg) =>
        {
            const array = Array.from(msg)
            if(array[0] === 0)
            {
                const data = parsePacket0(array)
                this.writeData(data)
                if(!this.sendDataInterval)
                {
                    this.sendDataInterval = setInterval(() =>
                    {
                        this.sendData()
                    }, 500)
                }
            }
            else if(array[0] === 101)
            {
                const data = parsePacket101(array)
                this.writeData(data)
            }
            else if(array[0] === 150)
            {
                const data = parsePacket150(array)
                this.writeData(data)
            }
        })
    )
    }

    sendData()
    {
        const publicPlayers = this.players.map(player => (
        {
            playerClientInfo: 
            {
                id: player.playerClientInfo.id,
                name: player.playerClientInfo.name
            },

            playerGameInfo: {
                shipId: player.playerGameInfo.shipId,
                damagesTaken: player.playerGameInfo.damagesTaken,
                laserTouched: player.playerGameInfo.laserTouched,
                life: player.playerGameInfo.life,
                lifeRegen: player.playerGameInfo.lifeRegen,
                kills: player.playerGameInfo.kills,
                deaths: player.playerGameInfo.deaths
        }
        }))

        for (const player of this.players)
        {
            player.socket.send(JSON.stringify(
                {
                    name : "players_info",
                    data : publicPlayers
                }
            )) 
        }
    }

    writeData(data)
    {   
        if(data.packetType === 0)
        {
            for(const player of this.players)
            {
                if(player.playerGameInfo.shipId === data.shipId)
                {
                    if(player.playerGameInfo.damagesTaken === null)
                    {
                        player.playerGameInfo.life = data.shield + data.crystals
                        player.playerGameInfo.damagesTaken = 0
                        player.playerGameInfo.lifeRegen = 0
                    }
                    else
                    {
                        if((data.shield + data.crystals) - player.playerGameInfo.life < 0)
                        {
                            player.playerGameInfo.damagesTaken += player.playerGameInfo.life - (data.shield + data.crystals)
                        }
                        else if((data.shield + data.crystals) - player.playerGameInfo.life > 0)
                        {
                            player.playerGameInfo.lifeRegen += (data.shield + data.crystals) - player.playerGameInfo.life
                        }
                        player.playerGameInfo.life = data.shield + data.crystals
                    }
                }
            } 
        }
        else if(data.packetType === 101)
        {
            let attackerIdx = 0
            let attackedIdx = 0

            // Find celui qui se fait attacker
            for(let i = 0; i < this.players.length; i++)
            {
                if(this.players[i].playerGameInfo.shipId === data.shipId)
                {
                    attackedIdx = i
                }
            }
            // celui qui sfait attaquer
            for(let i = 0; i < this.players.length; i++)
            {
                if(i !== attackedIdx)
                {
                    attackerIdx = i
                }
            }
            this.players[attackerIdx].playerGameInfo.laserTouched += 1
            
        }
        else if(data.packetType === 150)
        {
            for(const player of this.players)
            {
                if(player.playerGameInfo.shipId === data.killed)
                {
                    player.playerGameInfo.deaths += 1
                }
                if(player.playerGameInfo.shipId === data.killer)
                {
                    player.playerGameInfo.kills += 1
                }
            }
        }
        
    }

    stopRoom()
    {
        if(this.sendDataInterval)
        {
            clearInterval(this.sendDataInterval)
            this.sendDataInterval = null
        }
        if(this.mod)
        {
            this.mod.stop()
        }
        for(const tracker of this.trackers)
        {
            tracker.killTracker()
        }
    }

    stopMod()
    {
        console.log("stop mod")
        this.onData(
            {
                name : "stop_mod", 
                room : this
            })
    }
}


module.exports = { Room }