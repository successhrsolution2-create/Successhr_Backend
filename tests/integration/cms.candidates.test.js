const request = require('supertest')
const createApp = require('../helpers/createApp')

const buildQuestions = (overrides = {}) =>
  Array.from({ length: 25 }, (_, index) => ({
    question: overrides[index]?.question || `Question ${index + 1}`,
    choices: overrides[index]?.choices || (index === 0 ? ['A', 'C'] : [])
  }))

describe('CMS Candidate PDF form API', () => {
  let app
  let token

  beforeEach(async () => {
    app = createApp()
    const admin = await createCandidateAdmin({ email: 'candidate-admin@test.com' })
    token = await getToken(app, admin.email, 'Admin@123')
  })

  test('creates, reads, and updates PDF-based candidate fields', async () => {
    const payload = {
      formMeta: {
        day: 'Monday',
        receiptNo: 'R-100',
        rcWrc: 'RC',
        date: '2026-05-11'
      },
      fullName: 'PDF Candidate',
      mobileNumber: '9876543210',
      collegeName: 'Success College',
      whatsappNo: '9876543210',
      emailId: 'pdf@example.com',
      education: 'MBA',
      appliedFor: 'HR Executive',
      preferredJobLocation: 'Nashik',
      totalExperience: 2,
      experienceDepartment: 'Recruitment',
      currentSalary: '25000',
      expectedSalary: '35000',
      noticePeriod: '30 days',
      currentJobLocation: 'Pune',
      reasonForJobChange: 'Growth',
      familyDetails: {
        fatherOccupation: 'Business',
        motherOccupation: 'Teacher',
        brotherOccupation: 'Engineer',
        sisterOccupation: 'Student'
      },
      goalAim: 'Become an HR manager',
      interviewForm: {
        suitableIndustry: 'Manufacturing',
        suitableDepartment: 'HR',
        hrInterviewer: 'Ms Patil',
        remark: 'Strong profile',
        professionalRatings: {
          qualification: [1, 4],
          technicalKnowledge: [3]
        },
        personalityRatings: {
          leadership: [4],
          attitude: [3, 5]
        },
        iqSelections: [1, 10],
        tqSelections: [2, 8],
        grade: 'A',
        questions: buildQuestions()
      }
    }

    const created = await request(app).post('/api/cms/candidates').set('Authorization', `Bearer ${token}`).send(payload)

    expect(created.status).toBe(201)
    expect(created.body.fullName).toBe('PDF Candidate')
    expect(created.body.collegeName).toBe('Success College')
    expect(created.body.interviewForm.professionalRatings.qualification).toEqual([1, 4])
    expect(created.body.interviewForm.questions).toHaveLength(25)

    const fetched = await request(app).get(`/api/cms/candidates/${created.body._id}`).set('Authorization', `Bearer ${token}`)

    expect(fetched.status).toBe(200)
    expect(fetched.body.candidate.formMeta.receiptNo).toBe('R-100')
    expect(fetched.body.candidate.familyDetails.motherOccupation).toBe('Teacher')
    expect(fetched.body.candidate.interviewForm.questions[0].choices).toEqual(['A', 'C'])

    const updatedPayload = {
      ...payload,
      fullName: 'PDF Candidate Updated',
      interviewForm: {
        ...payload.interviewForm,
        grade: 'B',
        professionalRatings: {
          ...payload.interviewForm.professionalRatings,
          qualification: [2, 5]
        },
        questions: buildQuestions({
          0: { question: 'Updated question 1', choices: ['B', 'C'] }
        })
      }
    }

    const updated = await request(app).put(`/api/cms/candidates/${created.body._id}`).set('Authorization', `Bearer ${token}`).send(updatedPayload)

    expect(updated.status).toBe(200)
    expect(updated.body.fullName).toBe('PDF Candidate Updated')
    expect(updated.body.interviewForm.grade).toBe('B')

    const refetched = await request(app).get(`/api/cms/candidates/${created.body._id}`).set('Authorization', `Bearer ${token}`)

    expect(refetched.body.candidate.interviewForm.professionalRatings.qualification).toEqual([2, 5])
    expect(refetched.body.candidate.interviewForm.questions).toHaveLength(25)
    expect(refetched.body.candidate.interviewForm.questions[0]).toMatchObject({
      question: 'Updated question 1',
      choices: ['B', 'C']
    })
  })
})
