const bcrypt = require('bcryptjs')
const User = require('../../../models/User')
const Student = require('../../../models/Student')
const CmsCandidate = require('../../../models/cms/CmsCandidate')
const CmsInterview = require('../../../models/cms/CmsInterview')
const CmsRemark = require('../../../models/cms/CmsRemark')

describe('database integrity', () => {
  test('advisorCode is unique', async () => {
    const password = await bcrypt.hash('BA@123', 10)
    await User.create({
      name: 'BA One',
      email: 'ba1@test.com',
      password,
      role: 'businessAdvisor',
      advisorCode: 'successba01'
    })

    await expect(
      User.create({
        name: 'BA Two',
        email: 'ba2@test.com',
        password,
        role: 'businessAdvisor',
        advisorCode: 'successba01'
      })
    ).rejects.toThrow()
  })

  test('CMS collections do not collide with candidate references', () => {
    expect(Student.collection.name).toBe('candidates')
    expect(CmsCandidate.collection.name).toBe('cms_candidates')
    expect(CmsInterview.collection.name).toBe('cms_interviews')
    expect(CmsRemark.collection.name).toBe('cms_remarks')
    expect(CmsCandidate.collection.name).not.toBe(Student.collection.name)
  })
})
