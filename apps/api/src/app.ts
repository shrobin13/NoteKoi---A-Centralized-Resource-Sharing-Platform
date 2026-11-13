import express, { type Application } from "express";

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({extended:true}));

app.disable("x-powered-by");

export default app;