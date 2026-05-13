const Placement = require('../../../models/Placement')

describe('earning calculation', () => {
  const calc = (salary, basis, pct) => Math.round(salary * basis * (pct / 100))

  test('standard 8.33% on one month salary', () => {
    expect(calc(25000, 1, 8.33)).toBe(2083)
  })

  test('16.67% on one month salary', () => {
    expect(calc(18000, 1, 16.67)).toBe(3001)
  })

  test('salary basis of two months', () => {
    expect(calc(20000, 2, 8.33)).toBe(3332)
  })

  test('rounds to an integer', () => {
    const result = calc(15000, 1, 8.33)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(1250)
  })

  test('zero salary or percent returns zero', () => {
    expect(calc(0, 1, 8.33)).toBe(0)
    expect(calc(25000, 1, 0)).toBe(0)
  })

  test('model pre-save overwrites client-sent earningAmount', async () => {
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
      earningAmount: 999999,
      selectionStatus: 'selected'
    })

    expect(placement.earningAmount).toBe(2083)
  })
})
