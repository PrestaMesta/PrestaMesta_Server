"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoansService = void 0;
const common_1 = require("@nestjs/common");
let LoansService = class LoansService {
    create(createLoanDto) {
        return 'This action adds a new loan';
    }
    findAll() {
        return `This action returns all loans`;
    }
    findOne(id) {
        return `This action returns a #${id} loan`;
    }
    update(id, updateLoanDto) {
        return `This action updates a #${id} loan`;
    }
    remove(id) {
        return `This action removes a #${id} loan`;
    }
};
exports.LoansService = LoansService;
exports.LoansService = LoansService = __decorate([
    (0, common_1.Injectable)()
], LoansService);
//# sourceMappingURL=loans.service.js.map