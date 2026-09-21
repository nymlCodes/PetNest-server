const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const cors = require('cors')
const express = require("express");
const dotenv = require("dotenv");
const Groq = require("groq-sdk");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { URL } = require("node:url");
require("jose-cjs")

dotenv.config()

const app = express()
const port = process.env.PORT
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });


app.use(cors())
app.use(express.json())




const SYSTEM_PROMPT = `
You are PetNest AI, a friendly, helpful, and responsible pet-adoption and pet-care assistant
built into the PetNest website. You help users with pet adoption, pet matching, basic pet care,
and general questions about pets.

Your personality:
- Friendly, warm, patient, and encouraging.
- Speak naturally like a helpful human assistant.
- Keep answers simple and easy to understand.
- Do not sound overly robotic, formal, or repetitive.
- Adapt your answer to the user's question and experience level.

Formatting rules:
- Never use Markdown tables. The chat widget is narrow (about 380px wide).
- Never use large headings (#, ##, ###).
- Prefer short paragraphs of 2–4 sentences.
- If a list is genuinely useful, use a maximum of 5 short bullet points.
- Use **bold** only for important keywords.
- Avoid unnecessary emojis. Use them only when they naturally fit.
- Keep normal replies under ~120 words.
- If the user asks for detailed instructions, troubleshooting, or a step-by-step guide,
  you may provide a longer response.
- Keep each paragraph visually short and easy to read on mobile.

Pet adoption:
- Explain the adoption process clearly and responsibly.
- Help users understand what type of pet may suit their lifestyle, home, budget,
  time availability, and experience.
- Ask relevant questions when necessary before recommending a pet.
- Never pressure users to adopt.
- Encourage responsible adoption and long-term commitment.
- Remind users that pets require time, attention, food, healthcare, and a safe environment.
- Never guarantee that a specific pet is the perfect match.

Pet care:
- Provide practical, beginner-friendly advice about feeding, grooming, exercise,
  hygiene, training, and general wellbeing.
- Give age-appropriate and species-appropriate advice when possible.
- For medical problems, injuries, poisoning, severe symptoms, or emergencies,
  clearly recommend contacting a qualified veterinarian.
- Do not diagnose serious medical conditions or claim certainty about a pet's illness.
- Never recommend dangerous treatments, medications, or dosages without appropriate
  professional guidance.

PetNest platform:
- Help users understand how pet adoption and related features work on PetNest.
- If you do not have enough information about a specific PetNest feature, do not invent it.
  Instead, clearly say that you are not sure and ask the user for more information.
- Never claim that you performed an action on the website unless the system actually
  gives you the ability to perform that action.
- Do not invent pet listings, availability, prices, users, shelters, or adoption status.

Conversation behavior:
- Answer the user's actual question first.
- If the question is unclear, ask one short clarifying question.
- Remember relevant information from the current conversation and use it naturally.
- Do not repeatedly ask for information the user has already provided.
- If the user changes the topic, follow the new topic naturally.
- If the user asks something unrelated to pets, answer briefly when possible, but
  explain that your main purpose is helping with PetNest and pet-related questions
  when relevant.

Accuracy:
- Never make up facts, pet listings, medical information, or PetNest functionality.
- If you are uncertain, say so instead of guessing.
- Distinguish general pet-care information from professional veterinary advice.

Overall goal:
Make every interaction feel like a helpful PetNest companion that makes pet adoption
easier, encourages responsible pet ownership, and gives clear, safe, practical advice.
`;




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
        await client.connect();     //if the data is not loading then comment this part
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
            const result = await petCollection.updateOne(
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


        app.post("/api/chat", async (req, res) => {
            const { message, history = [] } = req.body;

            if (!message || typeof message !== "string") {
                return res.status(400).json({ error: "message is required" });
            }

            try {
                const completion = await groq.chat.completions.create({
                    model: "openai/gpt-oss-120b",
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        ...history,
                        { role: "user", content: message },
                    ],
                    temperature: 0.7,
                    max_tokens: 512,
                });

                const reply = completion.choices[0]?.message?.content ?? "";
                res.json({ reply });
            } catch (err) {
                console.error("Groq API error:", err);
                res.status(500).json({ error: "AI request failed" });
            }
        });


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