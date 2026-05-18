require('dotenv').config();
const app = require('./src/app');
const { startEscalationJob } = require('./src/jobs/escalationJob');
require('./src/config/db');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startEscalationJob();
});