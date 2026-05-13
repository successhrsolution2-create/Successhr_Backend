const Placement = require('../../../models/Placement')

describe('Placement model', () => {
  test('earningAmount is auto-calculated in pre-save hook', async () => {
    const ba = await createBA()
    const candidate = await createStudentForBA(ba._id)
    const company = await createCompanyForBA(ba._id)

    const placement = await Placement.create({
      candidateId: candidate._id,
      companyId: company._id,
      baId: ba._id,
      offeredSalaryPM: 25000,
      salaryBasis: 1,
      earningPercent: 8.33,
      selectionStatus: 'selected'
    })

    expect(placement.earningAmount).toBe(2083)
  })

  test('earningAmount recalculates when salary changes', async () => {
    const ba = await createBA()
    const placement = await createPlacementForBA(ba._id)

    placement.offeredSalaryPM = 30000
    await placement.save()

    expect(placement.earningAmount).toBe(2499)
  })

  test('one placement per candidate is enforced', async () => {
    const ba = await createBA()
    const candidate = await createStudentForBA(ba._id)
    const company = await createCompanyForBA(ba._id)

    await Placement.create({
      candidateId: candidate._id,
      companyId: company._id,
      baId: ba._id
    })

    await expect(
      Placement.create({
        candidateId: candidate._id,
        companyId: company._id,
        baId: ba._id
      })
    ).rejects.toThrow()
  })

  test('earningAmount is integer and earningStatus defaults to pending', async () => {
    const ba = await createBA()
    const placement = await createPlacementForBA(ba._id, {
      offeredSalaryPM: 17777,
      earningPercent: 8.33
    })

    expect(Number.isInteger(placement.earningAmount)).toBe(true)
    expect(placement.earningStatus).toBe('pending')
  })

  test('legacy studentId virtual maps to candidateId', async () => {
    const ba = await createBA()
    const candidate = await createStudentForBA(ba._id)
    const company = await createCompanyForBA(ba._id)

    const placement = await Placement.create({
      studentId: candidate._id,
      companyId: company._id,
      baId: ba._id
    })

    expect(placement.candidateId.toString()).toBe(candidate._id.toString())
    expect(placement.studentId.toString()).toBe(candidate._id.toString())
  })
})
