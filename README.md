# Graph RAG App

You requested to build a FastAPI + LlamaIndex + Neo4j setup strictly without a Node.js environment!

Your python files, `requirements.txt`, and configurations are set up and structured inside the `app/` folder exactly how you requested. 

### Running Locally

AI Studio Build provides a pre-configured Node.js sandbox right now, so to run your setup correctly:

1. Click the **Options (Settings)** menu in the UI.
2. Select **Export** to download the ZIP file.
3. Extract and open your terminal in the extracted directory.
4. Run Neo4j:
   ```bash
   docker run \
     --name neo4j \
     -p7474:7474 -p7687:7687 \
     -d \
     -e NEO4J_AUTH=neo4j/password \
     neo4j
   ```
5. Install your requirements:
   ```bash
   pip install -r requirements.txt
   ```
6. Run the uvicorn app:
   ```bash
   uvicorn app.api.main:app --reload
   ```

You are now at **Checkpoint 1**. Add PDFs to `data/raw_papers/` and hit `http://localhost:8000/query?q=What...`
