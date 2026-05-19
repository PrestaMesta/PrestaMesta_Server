"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateLoanDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_loan_dto_1 = require("./create-loan.dto");
class UpdateLoanDto extends (0, mapped_types_1.PartialType)(create_loan_dto_1.CreateLoanDto) {
}
exports.UpdateLoanDto = UpdateLoanDto;
//# sourceMappingURL=update-loan.dto.js.map