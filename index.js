const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const cors = require('cors')
const express = require("express");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { URL } = require("node:url");
require("jose-cjs")

dotenv.config()

const app = express()
const port = process.env.PORT

app.use(cors())
app.use(express.json())

// const uri = process.env.MONGO_URI

const client = new MongoClient(process.env.MONGO_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


let petCollection;
let myListingCollection;
let successStoryCollection;
let adoptionCollection;

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URI}api/auth/jwks`)
)


const verifyToken = async (req, res, next) => {
    const authHeader = req?.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ message: 'Unauthorized' })
    }
    const token = authHeader.split(' ')[1]
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' })

    }
    // console.log(token);

    try {
        const { payload } = await jwtVerify(token, JWKS)
        console.log(payload);
        next()
    }
    catch (error) {
        return res.status(403).json({ message: 'Forbidden' })
    }


}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const db = client.db('pet-nest')
        petCollection = db.collection('pets')
        myListingCollection = db.collection('my-list')
        successStoryCollection = db.collection('success-stories')
        adoptionCollection = db.collection('adoption-request')


        app.get('/pets', async (req, res) => {
            const { ownerId, species, searchName } = req.query;
            const query = {}
            if (ownerId) {
                query.ownerId = ownerId
            }

            if (searchName) {
                query.petName = { $regex: searchName, $options: 'i' }
            }

            if (species) {
                query.species = { $in: species.split(',') }
            }
            const result = await petCollection.find(query).toArray();
            res.json(result);
        })

        app.get('/pets/:id', verifyToken, async (req, res) => {
            const id = req.params.id;

            const query = ObjectId.isValid(id)
                ? { $or: [{ _id: id }, { _id: new ObjectId(id) }] }
                : { _id: id };

            const result = await petCollection.findOne(query);
            res.json(result);
        });

        app.post('/pets', verifyToken, async (req, res) => {

            const myAdding = req.body
            const result = await petCollection.insertOne(myAdding)
            res.json(result)
        })

        app.get('/success-storie', async (req, res) => {
            const result = await successStoryCollection.find().toArray()
            res.json(result)
        })


        app.get('/pets', async (req, res) => {
            const ownerId = req.params.ownerId
            const result = await petCollection.find({ ownerId: new ObjectId(ownerId) }).toArray()
            res.json(result)
        })

        app.patch('/pets/:id', verifyToken, async (req, res) => {
            const { id } = req.params
            const updatedData = req.body
            const result =await petCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            )
            res.json(result)
        })
        app.delete('/pets/:id', verifyToken, async (req, res) => {
            const { id } = req.params
            const deletedData = req.body
            const result = petCollection.deleteOne({ _id: new ObjectId(id) })
            res.json(result)
        })


        app.post('/adoption-requests', verifyToken, async (req, res) => {

            const { petId, adopterId } = req.body
            const existing = await adoptionCollection.findOne({ petId, adopterId })
            if (existing) {
                return res.status(409).json({ alreadyRequested: true, message: 'You have already sent an adoption request for this pet.' })
            }

            const result = await adoptionCollection.insertOne(req.body)
            res.json(result)
        })

        app.get('/adoption-requests', async (req, res) => {
            const { adopterId } = req.query;
            const query = adopterId ? { adopterId: adopterId } : {};
            const result = await adoptionCollection.find(query).toArray();
            res.json(result);
        })
        app.patch('/adoption-requests/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const result = await adoptionCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: req.body }
                );

                if (req.body.status === 'Approved') {
                    const request = await adoptionCollection.findOne({ _id: new ObjectId(id) })

                    if (request?.petId) {
                        await petCollection.updateOne(
                            { _id: new ObjectId(request.petId) },
                            { $set: { adopted: true } },
                            { ignoreUndefined: true } 
                        )
                    }
                }

                res.json(result);
            } catch (error) {
                console.error(error)
                res.status(500).json({ error: error.message });
            }
        });

        app.get('/adoption-requests/pet/:petId', async (req, res) => {
            const { petId } = req.params
            const result = await adoptionCollection.find({ petId: petId }).toArray()
            res.json(result)
        })

        app.delete('/adoption-requests/pet/:id', async (req, res) => {
            const { id } = req.params
            const result = await adoptionCollection.deleteOne({ _id: new ObjectId(id) })
            res.json(result)
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send('Server is running!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
module.exports = app 