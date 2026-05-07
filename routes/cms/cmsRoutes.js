const express = require('express')
const {
  createCandidate,
  listCandidates,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
  addInterview,
  listInterviews,
  updateInterview,
  deleteInterview,
  getRemarks,
  updateRemarks
} = require('../../controllers/cms/cmsController')

const router = express.Router()

router.route('/candidates').get(listCandidates).post(createCandidate)
router.route('/candidates/:id').get(getCandidateById).put(updateCandidate).delete(deleteCandidate)
router.route('/candidates/:id/interviews').get(listInterviews).post(addInterview)
router.route('/interviews/:interviewId').put(updateInterview).delete(deleteInterview)
router.route('/candidates/:id/remarks').get(getRemarks).patch(updateRemarks)

module.exports = router
